import {
  Discord, SelectMenuComponent,
  Slash, SlashGroup,
} from "discordx"
import {newLogger, traceCommand} from "../logging"
import {
  CommandInteraction, GuildMemberRoleManager,
  MessageActionRow,
  MessageEmbed,
  MessageSelectMenu, Role,
  SelectMenuInteraction
} from "discord.js"

const LOG = newLogger('Workflows')

function channelToRole(channelName: string): string | undefined {
  return /^🌿[-_\s](\S+)/g.exec(channelName)?.[1].replace(/[-_\s]/i, " ")
}

@Discord()
@SlashGroup("workflows", "Manage different projects and workflows")
class WorkflowsGroup {

  getWorkflowChannels(interaction: CommandInteraction | SelectMenuInteraction) {
    const channels = [...interaction.guild?.channels.cache.values() || []]
    return channels
      .filter(c => c.type === "GUILD_CATEGORY")
      .filter(c => c.name.startsWith("🌿"))
  }

  createRoleSelectMenu(interaction: CommandInteraction, menuType: "join" | "leave") {
    const userRoles = interaction.member?.roles as GuildMemberRoleManager
    const workflowRoles = this.getWorkflowChannels(interaction).map(c => channelToRole(c.name) || "c")
    const roles = menuType === "join" ?
      workflowRoles.map(c => ({ label: c, value: c }))
      : [...userRoles.cache.values()].filter(r => workflowRoles.includes(r.name)).map(r => ({
          label: r.name,
          value: r.name
        }))
    const roleSelection = new MessageSelectMenu()
      .addOptions(roles)
      .setPlaceholder(`Select projects to ${menuType}`)
      .setMinValues(1)
      .setMaxValues(roles.length)
      .setCustomId(`${menuType}-role-menu`)
    return new MessageActionRow().addComponents(roleSelection)
  }

  async createMissingRoles(interaction: SelectMenuInteraction) {
    const serverRoles = [...interaction.guild?.roles.cache.values() || []].map(r => r.name)
    const workflowRoles = this.getWorkflowChannels(interaction).map(c => channelToRole(c.name) || "")
    const rolesToMake = workflowRoles
      .filter(role => !serverRoles.includes(role))

    if (rolesToMake.length > 0) {
      LOG.info({
        event: `created ${rolesToMake.length} missing roles`,
        rolesCreated: rolesToMake
      })
    }

    // create missing roles
    await Promise.all(rolesToMake
      .map(role => interaction.guild?.roles.create({
        name: role,
        color: "RANDOM",
        reason: "Steward workflow role creation",
      })))
  }

  @SelectMenuComponent("join-role-menu")
  async handleJoin(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await this.createMissingRoles(interaction)

    const allRoles = interaction.guild?.roles.cache
    const selectedRoleValues = interaction.values || []
    const roles = interaction.member?.roles as GuildMemberRoleManager
    const userRoleValues = [...roles.cache.values()].map(r => r.name)

    // diff and add missing roles
    const rolesToAdd = selectedRoleValues.filter(r => !userRoleValues.includes(r))
    const ids = rolesToAdd
      .map(roleName => allRoles?.find(role => role.name === roleName))
      .filter((role): role is Role => role !== undefined)

    if (ids.length === 0) {
      return interaction.followUp("No new workflows added. You selected workflows you are already a part of!")
    }

    ids.forEach(roleId => roles.add(roleId))
    return interaction.followUp(`✨ Added you to ${ids.length} new workflows! ${ids.map(role => role.toString()).join(", ")}`)
  }

  @SelectMenuComponent("leave-role-menu")
  async handleLeave(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await this.createMissingRoles(interaction)

    const allRoles = interaction.guild?.roles.cache
    const selectedRoleValues = interaction.values || []
    const roles = interaction.member?.roles as GuildMemberRoleManager

    const ids = selectedRoleValues
      .map(roleName => allRoles?.find(role => role.name === roleName))
      .filter((role): role is Role => role !== undefined)

    ids.forEach(roleId => roles.remove(roleId))
    return interaction.followUp(`✨ Removed you from ${ids.length} workflows! ${ids.map(role => role.toString()).join(", ")}`)
  }

  @Slash("list", { description: "Show all workflows/projects" })
  async list(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    traceCommand(LOG, interaction)

    const layout = this.getWorkflowChannels(interaction).map(c => ({
      name: c.name,
      value: `Role: \`${channelToRole(c.name)}\`\nChannel: \`${c.name}\``,
    }))

    const embed = new MessageEmbed()
      .setColor('#B5936E')
      .setDescription(`Found ${layout.length} workflows. New workflows can be created by making a category that starts with the emoji 🌿`)
      .setFields(layout)

    // send it
    return interaction.editReply({ embeds: [embed] })
  }

  @Slash("join", { description: "Subscribe to new workflows/projects" })
  async join(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    traceCommand(LOG, interaction)
    const menu = this.createRoleSelectMenu(interaction, "join")

    return interaction.editReply({
      content: "🌱 Select workflows to join",
      components: [menu],
    })
  }

  @Slash("leave", { description: "Unsubscribe from existing workflows/projects" })
  async leave(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    traceCommand(LOG, interaction)
    const menu = this.createRoleSelectMenu(interaction, "leave")

    return interaction.editReply({
      content: "🧹 Select workflows to leave",
      components: [menu],
    })
  }
}