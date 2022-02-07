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
import {channelToRole, fixRolesAndPermissions, getLayerMap, getWorkflowChannels, serverRoles} from "./roleUtils"

const LOG = newLogger('Pace')

@Discord()
@SlashGroup("pace", "Manage the pace of your involvement with various workflows")
class Pace {
  @Slash("list", { description: "See current pace for workflows" })
    async list(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await fixRolesAndPermissions(interaction)
    traceCommand(LOG, interaction)

    const roles = interaction.member?.roles as GuildMemberRoleManager
    const roleNames = [...roles.cache.values()].map(r => r.name)
    const layers = Object.values(getLayerMap(interaction)).flat()
    const associatedLayers = layers.filter(l => roleNames.includes(l.roleName))

    const layout = associatedLayers.map(l => {
      const allOtherLayersInWorkflow = layers
        .filter(al => al.workflowName === l.workflowName && al.depth <= l.depth)
        .sort((a, b) => a.depth - b.depth)
        .map((l, i) => `  ${i + 1}. ${l.roleName}: ${l.channel}`)

      return ({
        name: l.workflowName + `, Pace Layer ${l.depth}`,
        value: `**Channels**
        ${allOtherLayersInWorkflow.join("\n")}`
      })
    })

    const description = associatedLayers.length === 0 ?
      "❌ Didn't find any associated workflows. Try joining some first using \`/workflows join\`" :
      `✨ Found ${associatedLayers.length} associated workflows. Use \`/pace set\` to adjust these!\n\nChannels are organized from low frequency important messages to high frequency day-to-day messages`
    const embed = new MessageEmbed()
      .setColor('#B5936E')
      .setDescription(description)
      .setFields(layout)
      .setFooter({text: "___\nLayers are ordered in terms of 'pace' or message flow. Lower layer number means more frequent and noisy updates, whereas higher layer numbers are less frequent and higher signal information."})

    return interaction.editReply({ embeds: [embed] })
  }

  createWorkflowSelectionMenu(interaction: CommandInteraction) {
    const userRoles = interaction.member?.roles as GuildMemberRoleManager
    const workflowRoles = getWorkflowChannels(interaction).map(c => channelToRole(c.name) || "")
    const paceRoles = [...userRoles.cache.values()].filter(r => workflowRoles.some(wf => r.name.startsWith(wf))).map(r => ({
      label: r.name.replace(/ P\d+$/, ""),
      value: r.name.replace(/ P\d+$/, "")
    }))
    const roleSelection = new MessageSelectMenu()
      .addOptions(paceRoles)
      .setPlaceholder('Select workflow to adjust pace layer for')
      .setCustomId("pace-workflow-menu")
    return new MessageActionRow().addComponents(roleSelection)
  }

  @SelectMenuComponent("pace-workflow-menu")
    async handlePaceRoleSelection(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await fixRolesAndPermissions(interaction)

    const selectedRoleValue = interaction.values[0]
    const menu = this.createPaceSelectionMenu(interaction, selectedRoleValue)

    return interaction.followUp({
      content: "⏳ Select pace layer. Lower layer number means more frequent and noisy updates, whereas higher layer numbers are less frequent and higher signal information.",
      components: [menu],
    })
  }

  createPaceSelectionMenu(interaction: SelectMenuInteraction, workflowName: string) {
    const layers = Object.values(getLayerMap(interaction)).flat()
    const associatedRoles = layers
      .filter(l => l.workflowName === workflowName)
      .map(l => ({
        label: `Pace Layer ${l.depth}`,
        value: l.roleName
      }))
    const roleSelection = new MessageSelectMenu()
      .addOptions(associatedRoles)
      .setPlaceholder(`Select pace layer for ${workflowName}`)
      .setCustomId("pace-select-menu")
    return new MessageActionRow().addComponents(roleSelection)
  }

  @SelectMenuComponent("pace-select-menu")
    async handlePaceSelection(interaction: SelectMenuInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    const selectedPaceValue = interaction.values[0]

    const workflowName = selectedPaceValue.replace(/ P\d+$/, "")
    const userRoles = interaction.member?.roles as GuildMemberRoleManager
    const oldPaceValue = [...userRoles.cache.values()].find(r => r.name.startsWith(workflowName))?.name || ""
    const allRoles = serverRoles(interaction)

    const extractDepth = (paceValue: string) => paceValue.match(/P(\d+)/)?.[1]

    const oldDepth = extractDepth(oldPaceValue) || 0
    const newDepth = extractDepth(selectedPaceValue) || 0

    if (oldDepth === newDepth) {
      return interaction.followUp("⚠️ You selected the same pace layer! Pace layer is unchanged")
    }

    // update roles
    const oldRole = allRoles.find(r => r.name === oldPaceValue) as Role
    const newRole = allRoles.find(r => r.name === selectedPaceValue) as Role
    await userRoles.add(newRole)
    await userRoles.remove(oldRole)
    return interaction.followUp(`${newDepth > oldDepth ? "🐇 Upped" : "🐢 Lowered"} your pace layer for ${workflowName} from ${oldRole} to ${newRole}!`)
  }

  @Slash("set", { description: "Set current pace layer for a workflow" })
    async set(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
    await fixRolesAndPermissions(interaction)
    traceCommand(LOG, interaction)

    const menu = this.createWorkflowSelectionMenu(interaction)

    return interaction.editReply({
      content: "⏳ Select workflow to adjust pace layer",
      components: [menu],
    })
  }
}