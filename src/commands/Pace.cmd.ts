import {Discord, SelectMenuComponent, Slash, SlashGroup} from "discordx"
import {newLogger, traceCommand} from "../logging"
import {
  CommandInteraction,
  GuildMemberRoleManager,
  MessageActionRow,
  MessageEmbed,
  MessageSelectMenu, Role,
  SelectMenuInteraction
} from "discord.js"
import {
  channelToRole,
  fixRolesAndPermissions,
  getLayerMap,
  getFeedChannels,
  getServerRoles,
  getPaceRoleDepth, getPaceRoleDepthFromString
} from "./roleUtils"

const LOG = newLogger('Pace')

@Discord()
@SlashGroup("pace", "Manage the pace of your involvement with various feeds")
class Pace {
  @Slash("list", { description: "See current pace for feeds" })
  async list(interaction: CommandInteraction): Promise<unknown> {
    if (interaction.guild) {
      await interaction.deferReply({ ephemeral: true })
      await fixRolesAndPermissions(interaction.guild)
      traceCommand(LOG, interaction)

      const roles = interaction.member?.roles as GuildMemberRoleManager
      const roleNames = [...roles.cache.values()].map(r => r.name)
      const layers = Object.values(getLayerMap(interaction.guild)).flat()
      const associatedLayers = layers.filter(l => roleNames.includes(l.roleName))

      const layout = associatedLayers.map(l => {
        const allOtherLayersInFeed = layers
          .filter(al => al.feedName === l.feedName && al.depth <= l.depth)
          .sort((a, b) => a.depth - b.depth)
          .map((l, i) => `  ${i + 1}. ${l.roleName}: ${l.channel}`)

        return ({
          name: l.feedName + `, Pace Layer ${l.depth}`,
          value: `**Channels**
        ${allOtherLayersInFeed.join("\n")}`
        })
      })

      const description = associatedLayers.length === 0 ?
        "❌ Didn't find any associated feeds. Try joining some first using \`/feeds join\`" :
        `✨ Found ${associatedLayers.length} associated feeds. Use \`/pace set\` to adjust these!\n\nChannels are organized from low frequency important messages to high frequency day-to-day messages`
      const embed = new MessageEmbed()
        .setColor('#B5936E')
        .setDescription(description)
        .setFields(layout)
        .setFooter({text: "___\nLayers are ordered in terms of 'pace' or message flow. Higher layer number means more frequent and noisy updates, whereas lower layer numbers are less frequent and higher signal information."})

      return interaction.editReply({ embeds: [embed] })
    }
  }

  createFeedSelectionMenu(interaction: CommandInteraction) {
    if (interaction.guild && interaction.member) {
      const userRoles = interaction.member.roles as GuildMemberRoleManager
      const feedRoles = getFeedChannels(interaction.guild).map(c => channelToRole(c.name) || "")
      const paceRoles = [...userRoles.cache.values()].filter(r => feedRoles.some(wf => r.name.startsWith(wf))).map(r => ({
        label: r.name.replace(/ P\d+$/, ""),
        value: r.name.replace(/ P\d+$/, "")
      }))
      const roleSelection = new MessageSelectMenu()
        .addOptions(paceRoles)
        .setPlaceholder('Select feed to adjust pace layer for')
        .setCustomId("pace-feed-menu")
      return new MessageActionRow().addComponents(roleSelection)
    } else {
      return new MessageActionRow()
    }
  }

  @SelectMenuComponent("pace-feed-menu")
  async handlePaceRoleSelection(interaction: SelectMenuInteraction): Promise<unknown> {
    if (interaction.guild) {
      await interaction.deferReply({ ephemeral: true })
      await fixRolesAndPermissions(interaction.guild)

      const selectedRoleValue = interaction.values[0]
      const menu = this.createPaceSelectionMenu(interaction, selectedRoleValue)

      return interaction.followUp({
        content: "⏳ Select pace layer. Higher layer number means more frequent and noisy updates, whereas lower layer numbers are less frequent and higher signal information.",
        components: [menu],
      })
    }
  }

  createPaceSelectionMenu(interaction: SelectMenuInteraction, feedName: string) {
    if (interaction.guild) {
      const layers = Object.values(getLayerMap(interaction.guild)).flat()
      const associatedRoles = layers
        .filter(l => l.feedName === feedName)
        .map(l => ({
          label: `Pace Layer ${l.depth}`,
          value: l.roleName
        }))
      const roleSelection = new MessageSelectMenu()
        .addOptions(associatedRoles)
        .setPlaceholder(`Select pace layer for ${feedName}`)
        .setCustomId("pace-select-menu")
      return new MessageActionRow().addComponents(roleSelection)
    } else {
      return new MessageActionRow()
    }
  }

  @SelectMenuComponent("pace-select-menu")
  async handlePaceSelection(interaction: SelectMenuInteraction): Promise<unknown> {
    if (interaction.guild && interaction.member) {
      await interaction.deferReply({ ephemeral: true })
      const selectedPaceValue = interaction.values[0]

      const feedName = selectedPaceValue.replace(/ P\d+$/, "")
      const userRoles = interaction.member.roles as GuildMemberRoleManager
      const oldPaceValue = [...userRoles.cache.values()].find(r => r.name.startsWith(feedName))?.name || ""
      const allRoles = getServerRoles(interaction.guild)

      const oldDepth = getPaceRoleDepthFromString(oldPaceValue) || 0
      const newDepth = getPaceRoleDepthFromString(selectedPaceValue) || 0

      if (oldDepth === newDepth) {
        return interaction.followUp("⚠️ You selected the same pace layer! Pace layer is unchanged")
      }

      // update roles
      const oldRole = allRoles.find(r => r.name === oldPaceValue) as Role
      const newRole = allRoles.find(r => r.name === selectedPaceValue) as Role
      await userRoles.add(newRole)
      await userRoles.remove(oldRole)
      return interaction.followUp(`${newDepth > oldDepth ? "🐇 Upped" : "🐢 Lowered"} your pace layer for ${feedName} from ${oldRole} to ${newRole}!`)
    }
  }

  @Slash("set", { description: "Set current pace layer for a feed" })
  async set(interaction: CommandInteraction): Promise<unknown> {
    if (interaction.guild) {
      await interaction.deferReply({ ephemeral: true })
      await fixRolesAndPermissions(interaction.guild)
      traceCommand(LOG, interaction)

      const menu = this.createFeedSelectionMenu(interaction)
      return interaction.editReply({
        content: "⏳ Select feed to adjust pace layer",
        components: [menu],
      })
    }
  }
}