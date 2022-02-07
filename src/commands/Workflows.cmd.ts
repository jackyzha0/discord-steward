import {Discord, SelectMenuComponent, Slash, SlashGroup,} from "discordx"
import {newLogger, traceCommand} from "../logging"
import {
  Collection,
  CommandInteraction,
  GuildMember,
  GuildMemberRoleManager,
  MessageActionRow,
  MessageEmbed,
  MessageSelectMenu,
  Role,
  SelectMenuInteraction
} from "discord.js"
import {
  channelToRole,
  fixRolesAndPermissions,
  getLayerMap,
  getFeedChannels,
} from "./roleUtils"

const LOG = newLogger('Feeds')

@Discord()
@SlashGroup("feeds", "Manage different feeds and feeds")
class FeedsGroup {
  createRoleSelectMenu(interaction: CommandInteraction, menuType: "join" | "leave") {
    const userRoles = interaction.member?.roles as GuildMemberRoleManager
    const feedRoles = getFeedChannels(interaction).map(c => channelToRole(c.name) || "c")
    const roles = menuType === "join" ?
      feedRoles.map(c => ({ label: c, value: c }))
      : [...userRoles.cache.values()].filter(r => feedRoles.some(wf => r.name.startsWith(wf))).map(r => ({
          label: r.name.replace(/ P\d+$/, ""),
          value: r.name
        }))
    if (roles.length === 0) {
      throw 'No roles to leave!'
    }
    const roleSelection = new MessageSelectMenu()
      .addOptions(roles)
      .setPlaceholder(`Select feeds to ${menuType}`)
      .setMinValues(1)
      .setMaxValues(roles.length)
      .setCustomId(`${menuType}-role-menu`)
    return new MessageActionRow().addComponents(roleSelection)
  }

  @SelectMenuComponent("join-role-menu")
    async handleJoin(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await fixRolesAndPermissions(interaction)

    const allRoles = interaction.guild?.roles.cache
    const layers = Object.values(getLayerMap(interaction)).flat()
    const selectedRoleValues = interaction.values || []
    const roles = interaction.member?.roles as GuildMemberRoleManager
    const userRoleValues = [...roles.cache.values()].map(r => r.name)

    // diff and add missing roles
    const rolesToAdd = selectedRoleValues
      .filter(r => !userRoleValues.some(userRole => userRole.startsWith(r)))
      .map(feed => layers.find(l => l.feedName === feed)?.roleName) as string[]
    const ids = rolesToAdd
      .map(roleName => allRoles?.find(role => role.name === roleName))
      .filter((role): role is Role => role !== undefined)

    if (ids.length === 0) {
      return interaction.followUp("No new feeds added. You selected feeds you are already a part of!")
    }

    ids.forEach(roleId => roles.add(roleId))
    return interaction.followUp(`✨ Added you to ${ids.length} new feeds! ${ids.map(role => role.toString()).join(", ")}.\n\n Set your pace layer for these feeds by doing \`/pace set\``)
  }

  @SelectMenuComponent("leave-role-menu")
    async handleLeave(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await fixRolesAndPermissions(interaction)

    const allRoles = interaction.guild?.roles.cache
    const selectedRoleValues = interaction.values || []
    const roles = interaction.member?.roles as GuildMemberRoleManager

    const ids = selectedRoleValues
      .map(roleName => allRoles?.find(role => role.name === roleName))
      .filter((role): role is Role => role !== undefined)

    ids.forEach(roleId => roles.remove(roleId))
    return interaction.followUp(`✨ Removed you from ${ids.length} feeds! ${ids.map(role => role.toString()).join(", ")}`)
  }

  @Slash("list", { description: "Show all feeds" })
    async list(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await fixRolesAndPermissions(interaction)
    traceCommand(LOG, interaction)

    const allRoles = interaction.guild?.roles.cache
    const layers = getLayerMap(interaction)
    const formattedLayers = (id: string) => layers[id]
      .map(l => `${allRoles?.find(role => role.name === l.roleName)}: ${l.channel}`).join('\n')
    const layout = getFeedChannels(interaction)
      .filter(c => layers[c.id].length > 0)
      .map(c => {
      const members = c.members as Collection<string, GuildMember>
      return {
        name: c.name,
        value: `${members.filter(m => !m.user.bot).size} people in this feed
        \n**${layers[c.id].length} Layers**\n${formattedLayers(c.id)}`,
      }
    })

    const embed = new MessageEmbed()
      .setColor('#B5936E')
      .setDescription(`Found ${layout.length} feeds. New feeds can be created by making a category that starts with the emoji 🌿.`)
      .setFields(layout)
      .setFooter({text: "___\nLayers are ordered in terms of message flow. Higher layer number means more frequent and noisy updates, whereas lower layer numbers are less frequent and higher signal information."})

    return interaction.editReply({ embeds: [embed] })
  }

  @Slash("join", { description: "Subscribe to new feeds" })
    async join(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    traceCommand(LOG, interaction)
    const menu = this.createRoleSelectMenu(interaction, "join")

    return interaction.editReply({
      content: "🌱 Select feeds to join",
      components: [menu],
    })
  }

  @Slash("leave", { description: "Unsubscribe from existing feeds" })
    async leave(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    traceCommand(LOG, interaction)

    try {
      const menu = this.createRoleSelectMenu(interaction, "leave")
      return interaction.editReply({
        content: "🧹 Select feeds to leave",
        components: [menu],
      })
    } catch (e) {
      if (e === "No roles to leave!") {
        return interaction.editReply({
          content: "❌ You are not a part of any feeds that can be left!",
        })
      }
    }
  }
}