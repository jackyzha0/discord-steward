import {Discord, SelectMenuComponent, Slash, SlashGroup,} from "discordx"
import {newLogger, traceCommand} from "../logging"
import {
  Collection,
  CommandInteraction,
  GuildBasedChannel, GuildChannel,
  GuildMember,
  GuildMemberRoleManager,
  MessageActionRow,
  MessageEmbed,
  MessageSelectMenu,
  Role,
  SelectMenuInteraction
} from "discord.js"

const LOG = newLogger('Workflows')

function channelToRole(channelName: string): string | undefined {
  return /^🌿[-_\s](\S+)/g.exec(channelName)?.[1].replace(/[-_\s]/i, " ")
}

interface Layer {
  depth: number
  channel: GuildBasedChannel
}

@Discord()
@SlashGroup("workflows", "Manage different projects and workflows")
class WorkflowsGroup {

  getLayerMap(interaction: CommandInteraction | SelectMenuInteraction) {
    const channels = [...interaction.guild?.channels.cache.values() || []]
    return channels.reduce<{ [key: string]: Layer[] }>((total, cur) => {
      if (cur.type === "GUILD_CATEGORY") {
        total[cur.id] = []
      } else {
        const depthString = cur.name.match(/p(\d+)/)?.[1]
        if (depthString !== undefined) {
          total[cur.parentId ?? ""].push({
            depth: parseInt(depthString),
            channel: cur
          })
        }
      }
      return total
    }, {})
  }

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
    if (roles.length === 0) {
      throw 'No roles to leave!'
    }
    const roleSelection = new MessageSelectMenu()
      .addOptions(roles)
      .setPlaceholder(`Select projects to ${menuType}`)
      .setMinValues(1)
      .setMaxValues(roles.length)
      .setCustomId(`${menuType}-role-menu`)
    return new MessageActionRow().addComponents(roleSelection)
  }

  async fixRolesAndPermissions(interaction: SelectMenuInteraction) {
    const serverRoles = [...interaction.guild?.roles.cache.values() || []]
    const workflowRoles = this.getWorkflowChannels(interaction).map(c => channelToRole(c.name) || "")
    const rolesToMake = workflowRoles
      .filter(role => !serverRoles.map(r => r.name).includes(role))

    // early return if all roles are setup
    // if (rolesToMake.length === 0) {
    //   return
    // }

    // create missing roles
    await Promise.all(rolesToMake
      .map(role => interaction.guild?.roles.create({
        name: role,
        color: "RANDOM",
        reason: "Steward workflow role creation",
      })))
    LOG.info({
      event: `created ${rolesToMake.length} missing roles`,
      rolesCreated: rolesToMake
    })

    // bot role
    const botRole = serverRoles.find(r => r.name === "Steward") as Role

    // do channel setup now
    const workflowChannels = this.getWorkflowChannels(interaction) as GuildChannel[]
    workflowChannels.forEach((c) => {
      // by default, hide from all, allow self
      c.permissionOverwrites.create(botRole, { VIEW_CHANNEL: true })
      c.permissionOverwrites.create(c.guild.roles.everyone, { VIEW_CHANNEL: false })

      // get role name for associated workstream and allow viewing
      const role = serverRoles.find(r => r.name === channelToRole(c.name))
      if (role) {
        c.permissionOverwrites.create(role, { VIEW_CHANNEL: true })
      } else {
        LOG.error(`Couldn't find role ${channelToRole(c.name)} in server!`)
      }
    })
  }

  @SelectMenuComponent("join-role-menu")
  async handleJoin(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await this.fixRolesAndPermissions(interaction)

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
    return interaction.followUp(`✨ Added you to ${ids.length} new workflows! ${ids.map(role => role.toString()).join(", ")}.\n\n Set your pace layer for these projects by doing \`/pace set\``)
  }

  @SelectMenuComponent("leave-role-menu")
  async handleLeave(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await this.fixRolesAndPermissions(interaction)

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

    const allRoles = interaction.guild?.roles.cache
    const layers = this.getLayerMap(interaction)
    const formattedLayers = (id: string) => layers[id]
      .sort((a, b) => a.depth - b.depth)
      .map(l => `Layer ${l.depth}: ${l.channel}`).join('\n')
    const layout = this.getWorkflowChannels(interaction).map(c => {
      const members = c.members as Collection<string, GuildMember>
      return {
        name: c.name,
        value: `${members.filter(m => !m.user.bot).size} people with role ${allRoles?.find(role => role.name === channelToRole(c.name))?.toString()}
        \n**${layers[c.id].length} Layers**\n${formattedLayers(c.id)}`,
      }
    })

    const embed = new MessageEmbed()
      .setColor('#B5936E')
      .setDescription(`Found ${layout.length} workflows. New workflows can be created by making a category that starts with the emoji 🌿.`)
      .setFields(layout)
      .setFooter({text: "___\nLayers are ordered in terms of message flow. Lower layer number means more frequent and noisy updates, whereas higher layer numbers are less frequent and higher signal information."})

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

    try {
      const menu = this.createRoleSelectMenu(interaction, "leave")
      return interaction.editReply({
        content: "🧹 Select workflows to leave",
        components: [menu],
      })
    } catch (e) {
      if (e === "No roles to leave!") {
        return interaction.editReply({
          content: "❌ You are not a part of any workflows that can be left!",
        })
      }
      return
    }
  }
}