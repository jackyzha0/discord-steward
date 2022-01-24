import {Discord, Slash, SlashGroup} from "discordx";
import {newLogger, traceCommand} from "../logging";
import {CommandInteraction, GuildMemberRoleManager, MessageEmbed} from "discord.js";
import {getLayerMap} from "./roleUtils";

const LOG = newLogger('Pace')

@Discord()
@SlashGroup("pace", "Manage the pace of your involvement with various workflows")
class Pace {
  @Slash("list", { description: "See current pace for workflows" })
  async list(interaction: CommandInteraction): Promise<unknown> {
    await interaction.deferReply({ ephemeral: true })
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
      .setFooter({text: "___\nLayers are ordered in terms of message flow. Lower layer number means more frequent and noisy updates, whereas higher layer numbers are less frequent and higher signal information."})

    return interaction.editReply({ embeds: [embed] })
  }

  // @Slash("set", { description: "Set current pace for a workflow" })
  // async set(interaction: CommandInteraction): Promise<unknown> {
  //   await interaction.deferReply({ ephemeral: true })
  //   traceCommand(LOG, interaction)
  // }
}