import {Discord, Slash, SlashGroup} from "discordx"
import {CommandInteraction, GuildMember, MessageEmbed, Permissions} from "discord.js"
import {newLogger, traceCommand} from "../logging"
import {fixRolesAndPermissions, serverRoles} from "./roleUtils"

const LOG = newLogger('Misc')

@Discord()
@SlashGroup("steward", "Miscellaneous commands for managing Steward")
class Misc {
  @Slash("reset", { description: "Recreates all roles and permissions. Only administrators can perform this command" })
    async reset(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    traceCommand(LOG, interaction)

    // check for appropriate permissions
    const guildMember = interaction.member as GuildMember
    if (!guildMember.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
      return interaction.editReply({
        content: "❌ You must be an administrator to perform this command",
      })
    }

    // delete all workflow roles
    const role = serverRoles(interaction)
    const workflowRoles = role.filter(r => r.name.match(/ P\d+$/))
    await Promise.all(workflowRoles.map(role => role.delete()))

    LOG.warn({
      event: `deleted ${workflowRoles.length} roles`,
      rolesDeleted: workflowRoles
    })

    // recreate
    const madeRoles = await fixRolesAndPermissions(interaction, true)

    const embed = new MessageEmbed()
      .setColor('#9c4630')
      .setDescription(`🧨 Nuked ${workflowRoles.length} roles. Recreated ${madeRoles?.length} roles.`)

    return interaction.editReply({ embeds: [embed] })
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
        'Steward is an attempt to give back agency to users to control the speed of information in the projects they are a part of.')
      .addFields(
        { name: 'Get Started', value: `
        - See what workflows are available using \`/workflows list\`
        - Join a workflow using \`/workflows join\`
        - Set your pace level using \`/pace set\`
        - React to messages using ✨. This is referred to as 'democratic pinning' where messages that surpass a number of reactions get boosted up a pace layer.
        ` },
      )
      .setFooter({ text: '___\nView source @ https://github.com/jackyzha0/discord-steward/' });

    return interaction.editReply({ embeds: [embed] })
  }
}