import {Discord, SelectMenuComponent, Slash, SlashGroup,} from "discordx"
import {newLogger, traceCommand} from "../logging"
import {
  Collection, ColorResolvable,
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
import ColorHash from "color-hash-ts";

const LOG = newLogger('Workflows')

const colorHash = new ColorHash({ lightness: 0.6, saturation: 0.4 });

function channelToRole(channelName: string): string | undefined {
  return /^🌿[-_\s](\S+)/g.exec(channelName)?.[1].replace(/[-_\s]/i, " ")
}

function isWorkFlow(c: GuildBasedChannel | GuildChannel | null): boolean {
  return !!c?.name.startsWith("🌿")
}

interface Layer {
  depth: number
  channel: GuildBasedChannel
  roleName: string
  workflowName: string | undefined
}

@Discord()
@SlashGroup("workflows", "Manage different projects and workflows")
class WorkflowsGroup {

  getLayerMap(interaction: CommandInteraction | SelectMenuInteraction) {
    const channels = [...interaction.guild?.channels.cache.values() || []]
    return channels
      .reduce<{ [key: string]: Layer[] }>((total, cur) => {
        if (cur.type === "GUILD_CATEGORY") {
          total[cur.id] = []
        } else {
          const depthString = cur.name.match(/p(\d+)/)?.[1]
          if (depthString !== undefined && isWorkFlow(cur.parent)) {
            const parentRoleName = channelToRole(cur.parent?.name || "")
            const id = cur.parentId ?? ""
            total[id].push({
              depth: parseInt(depthString),
              channel: cur,
              roleName: `${parentRoleName} P${depthString}`,
              workflowName: parentRoleName,
            })
            total[id] = total[id].sort((a, b) => a.depth - b.depth)
          }
        }
        return total
      }, {})
  }

  getWorkflowChannels(interaction: CommandInteraction | SelectMenuInteraction) {
    const channels = [...interaction.guild?.channels.cache.values() || []]
    return channels
      .filter(c => c.type === "GUILD_CATEGORY")
      .filter(isWorkFlow)
  }

  createRoleSelectMenu(interaction: CommandInteraction, menuType: "join" | "leave") {
    const userRoles = interaction.member?.roles as GuildMemberRoleManager
    const workflowRoles = this.getWorkflowChannels(interaction).map(c => channelToRole(c.name) || "c")
    const roles = menuType === "join" ?
      workflowRoles.map(c => ({ label: c, value: c }))
      : [...userRoles.cache.values()].filter(r => workflowRoles.some(wf => r.name.startsWith(wf))).map(r => ({
          label: r.name.replace(/ P\d+$/, ""),
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
    let serverRoles = [...interaction.guild?.roles.cache.values() || []]
    const layerMap = this.getLayerMap(interaction)
    const layerRoles = Object.values(layerMap)
      .flat()
      .map(l => ({
        color: colorHash.hex(l.workflowName || ""),
        name: l.roleName
      }))

    const rolesToMake = layerRoles.filter(role => !serverRoles.map(r => r.name).includes(role.name || ""))

    // early return if all roles are setup
    if (rolesToMake.length === 0) {
      return
    }

    // create missing roles
    await Promise.all(rolesToMake
      .map(role => interaction.guild?.roles.create({
        name: role.name,
        color: role.color as ColorResolvable,
        reason: "Steward workflow role creation",
      })))
    LOG.info({
      event: `created ${rolesToMake.length} missing roles`,
      rolesCreated: rolesToMake
    })

    // bot role + refresh roles after creating new ones
    serverRoles = [...interaction.guild?.roles.cache.values() || []]
    const getRoleByName = (name: string) => serverRoles.find(r => r.name === name) as Role
    const botRole = getRoleByName("Steward")

    // bind workflow channels to roles
    const channels = [...interaction.guild?.channels.cache.values() || []]
    const findChannelById = (id: string) => channels.find(c => c.id === id) as GuildChannel
    Object.keys(layerMap).forEach(workflowCategoryId => {
      // by default, hide from all, allow bot to view
      const cat = findChannelById(workflowCategoryId)
      cat.permissionOverwrites.create(botRole, { VIEW_CHANNEL: true })

      if (isWorkFlow(cat)) {
        cat.permissionOverwrites.create(cat.guild.roles.everyone, { VIEW_CHANNEL: false })

        // cascade depth role permissions
        const layers = layerMap[workflowCategoryId]
        layers.forEach(l => {
          const layerRole = getRoleByName(l.roleName)

          // get all depths below current depth
          const viewableLayers = layers.filter(pl => pl.depth <= l.depth)
          viewableLayers.forEach(vl => {
            const chan = vl.channel as GuildChannel
            chan.permissionOverwrites.create(layerRole, { VIEW_CHANNEL: true })
          })
        })
      } else {
        cat.permissionOverwrites.delete(cat.guild.roles.everyone)
      }
    })
  }

  @SelectMenuComponent("join-role-menu")
  async handleJoin(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await this.fixRolesAndPermissions(interaction)

    const allRoles = interaction.guild?.roles.cache
    const layers = Object.values(this.getLayerMap(interaction)).flat()
    const selectedRoleValues = interaction.values || []
    const roles = interaction.member?.roles as GuildMemberRoleManager
    const userRoleValues = [...roles.cache.values()].map(r => r.name)

    // diff and add missing roles
    const rolesToAdd = selectedRoleValues
      .filter(r => !userRoleValues.some(userRole => userRole.startsWith(r)))
      .map(workflow => layers.find(l => l.workflowName === workflow)?.roleName) as string[]
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
      .map(l => `${allRoles?.find(role => role.name === l.roleName)}: ${l.channel}`).join('\n')
    const layout = this.getWorkflowChannels(interaction)
      .filter(c => layers[c.id].length > 0)
      .map(c => {
      const members = c.members as Collection<string, GuildMember>
      return {
        name: c.name,
        value: `${members.filter(m => !m.user.bot).size} people in this channel
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