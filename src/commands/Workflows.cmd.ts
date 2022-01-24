import {
  Discord, SelectMenuComponent,
  Slash, SlashGroup,
} from "discordx"
import {newLogger, trace} from "../logging"
import {
  CommandInteraction,
  MessageActionRow,
  MessageEmbed,
  MessageSelectMenu,
  SelectMenuInteraction
} from "discord.js"

const LOG = newLogger('Workflows')

function channelToRole(channelName: string): string | undefined {
  return /^🌿[-_\s](\S+)/g.exec(channelName)?.[1].replace(/[-_\s]/i, " ")
}

@Discord()
@SlashGroup("workflows", "Manage different projects and workflows")
class WorkflowsGroup {

  getWorkflowChannels(interaction: CommandInteraction) {
    const channels = [...interaction.guild?.channels.cache.values() || []]
    return channels
      .filter(c => c.type === "GUILD_CATEGORY")
      .filter(c => c.name.startsWith("🌿"))
  }

  createRoleSelectMenu(interaction: CommandInteraction) {
    const roles = this.getWorkflowChannels(interaction)
      .map(c => ({
        label: channelToRole(c.name) || "",
        value: channelToRole(c.name) || ""
      }))
    const roleSelection = new MessageSelectMenu()
      .addOptions(roles)
      .setPlaceholder("Select a project")
      .setMinValues(1)
      .setMaxValues(roles.length)
      .setCustomId("role-menu")
    return new MessageActionRow().addComponents(roleSelection)
  }

  @SelectMenuComponent("role-menu")
  async handle(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    const roleValues = interaction.values || []

    return interaction.followUp(roleValues.join(", "))
  }

  @Slash("list", { description: "Show all workflows/projects" })
  async list(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    trace(LOG, interaction)

    const layout = this.getWorkflowChannels(interaction).map(c => ({
      name: c.name,
      value: `Role: \`${channelToRole(c.name)}\`\nChannel: \`${c.name}\``,
    }))

    const embed = new MessageEmbed()
      .setColor('#B5936E')
      .setDescription(`Found ${layout.length} workflows. A workflow is a category that starts with the emoji 🌿`)
      .setFields(layout)

    // send it
    return interaction.editReply({ embeds: [embed] })
  }

  @Slash("join", { description: "Join workflows/projects" })
  async join(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    trace(LOG, interaction)
    const menu = this.createRoleSelectMenu(interaction)

    return interaction.editReply({
      content: "🌱 Select workflows to join",
      components: [menu],
    })
  }
}