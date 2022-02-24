import {Discord, Slash, SlashGroup} from "discordx"
import {CommandInteraction, GuildMember, MessageEmbed, Permissions} from "discord.js"
import {newLogger, traceCommand} from "../logging"
import {fixRolesAndPermissions, removeAllRoles, setLayerProperties} from "./roleUtils"

const LOG = newLogger('Misc')

@Discord()
@SlashGroup("steward", "Miscellaneous commands for managing Steward")
class Misc {
  @Slash("clean", { description: "Remove all associated roles" })
  async clean(interaction: CommandInteraction): Promise<unknown> {
    if (interaction.guild && interaction.member) {
      await interaction.deferReply({ ephemeral: true })
      traceCommand(LOG, interaction)

      // check for appropriate permissions
      const guildMember = interaction.member as GuildMember
      if (!guildMember.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        return interaction.editReply({
          content: "❌ You must be an administrator to perform this command",
        })
      }

      // delete all feed roles
      const feedRoles = await removeAllRoles(interaction.guild)
      const embed = new MessageEmbed()
        .setColor('#9c4630')
        .setDescription(`🧨 Nuked ${feedRoles.length} roles.`)
      return interaction.editReply({ embeds: [embed] })
    }
  }

  @Slash("reset", { description: "Recreates all roles and permissions. Only administrators can perform this command" })
  async reset(interaction: CommandInteraction): Promise<unknown> {
    if (interaction.guild && interaction.member) {
      await interaction.deferReply({ ephemeral: true })
      traceCommand(LOG, interaction)

      // check for appropriate permissions
      const guildMember = interaction.member as GuildMember
      if (!guildMember.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        return interaction.editReply({
          content: "❌ You must be an administrator to perform this command",
        })
      }

      // delete all feed roles
      const feedRoles = await removeAllRoles(interaction.guild)

      // recreate
      const madeRoles = await fixRolesAndPermissions(interaction.guild, true)

      const embed = new MessageEmbed()
        .setColor('#9c4630')
        .setDescription(`🧨 Nuked ${feedRoles.length} roles. Recreated ${madeRoles?.length} roles.`)

      return interaction.editReply({ embeds: [embed] })
    }
  }

  @Slash("refresh", { description: "Rebind roles to channels. You should only call this command if something is broken" })
  async refresh(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply()
    traceCommand(LOG, interaction)

    const embed = new MessageEmbed()
      .setColor('#9c4630')

    if (interaction.guild) {
      await setLayerProperties(interaction.guild)
      embed.setDescription("Successfully re-binded roles.")
      return interaction.editReply({ embeds: [embed] })
    } else {
      embed.setDescription("Please run this command in a server")
      return interaction.editReply({ embeds: [embed] })
    }
  }

  @Slash("help", { description: "Details on how to get started with Steward" })
  async help(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply()
    traceCommand(LOG, interaction)

    const embed = new MessageEmbed()
      .setColor('#B5936E')
      .setTitle("Steward Help Page")
      .setDescription('Stream interfaces like Discord and Slack basically create a single global timeline that moves at a certain rate. If you miss a certain conversation, it flows away. ' +
        'Someone once described Slack as the online version of the open office arrangement – it puts the pressure of everything being visible all the time to everybody on the individual. ' +
        'Steward is an attempt to give back agency to users to control the speed of information in the feeds they are a part of.')
      .addFields(
        { name: 'Get Started', value: `
        - See what feeds are available using \`/feeds list\`
        - Join a feed using \`/feeds join\`
        - Set your pace level using \`/pace set\`
        - React to messages using ✨. This is referred to as 'democratic pinning' where messages that surpass a number of reactions get boosted up a pace layer.
        ` },
      )
      .setFooter({ text: '___\nView source @ https://github.com/jackyzha0/discord-steward/' });

    return interaction.editReply({ embeds: [embed] })
  }
}