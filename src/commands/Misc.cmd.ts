import {Discord, Slash, SlashGroup} from "discordx";
import {CommandInteraction, GuildMember, MessageEmbed, Permissions, SelectMenuInteraction} from "discord.js";
import {newLogger, traceCommand} from "../logging";

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

    const embed = new MessageEmbed()
      .setColor('#9c4630')
      .setDescription('Nuked.')

    return interaction.editReply({ embeds: [embed] })
  }

  @Slash("help", { description: "Details on how to get started with Steward" })
  async help(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply()
    traceCommand(LOG, interaction)

    const embed = new MessageEmbed()
      .setColor('#9c4630')
      .setDescription('bottom text.')

    return interaction.editReply({ embeds: [embed] })
  }
}