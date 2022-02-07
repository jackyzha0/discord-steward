import {ArgsOf, Discord, On} from "discordx"
import {GuildChannel, MessageEmbed, MessageReaction, TextBasedChannel} from "discord.js"
import {guildLayerMap, Layer} from "./roleUtils";
import {newLogger} from "../logging";

const LOG = newLogger('Starboard')

@Discord()
class Starboard {

  constructStarboardEmbed(reaction: MessageReaction, layer: Layer) {
    const message = reaction.message

    const embed = message.embeds[0] ||
      new MessageEmbed()
      .setColor('#B5936E')
      .setAuthor({ name: message.author?.username || "", iconURL: message.author?.displayAvatarURL() })
      .setTimestamp(message.createdTimestamp)
      .setDescription(message.content || "")
      .setFooter({ text: `___\nSurfaced from pace layer ${layer.depth}. Can't see this channel? Try setting the right pace layer by doing /pace set` })

    const attachment = message.attachments.first()
    if (attachment) {
      embed.setImage(attachment.url)
    }

    return embed
  }

  @On("messageReactionAdd")
  async onReact(
    [reaction]: ArgsOf<"messageReactionAdd">, // Type message automatically
  ) {
    const isSparkle = reaction.emoji.name === "✨"
    if (isSparkle) {
      if (reaction.partial) {
        await reaction.fetch()
      }

      const sentChannel = reaction.message.channel as GuildChannel
      const channelSize = sentChannel.members.size
      const layers = Object.values(guildLayerMap(reaction.message.guild?.channels)).flat()
      const isHighSignal = (reaction.count || 0) === Math.ceil(1.3 * Math.sqrt(channelSize / 2))

      LOG.trace({
        type: "reaction",
        isHighSignal,
        sentChannel: sentChannel.id,
        count: reaction.count,
      })

      if (isHighSignal && layers.map(l => l.channel.id).includes(sentChannel.id)) {
        const sentLayer = layers.find(l => l.channel.id === sentChannel.id) as Layer
        const feedLayers = layers
          .filter(l => l.feedName === sentLayer.feedName)
          .sort((a, b) => a.depth - b.depth)

        // fn to get index of chan id
        const indexOfChan = (chan: GuildChannel) => {
          return feedLayers.findIndex(l => l.channel.id === chan.id)
        }

        // check if already at top
        if (indexOfChan(sentChannel) === 0) {
          // do nothing, early return
          return
        }

        LOG.info({
          user: reaction.message.member?.id,
          reactionCount: reaction.count,
          channelSize: channelSize,
          guildName: reaction.message.guild?.name || "Guild name unknown",
          guildId: reaction.message.guildId,
          channelName: sentChannel.name,
          channelId: sentChannel.id,
          timestamp: reaction.message.createdTimestamp
        })

        // otherwise, repost in higher level
        const channelToSend = feedLayers[indexOfChan(sentChannel) - 1].channel as TextBasedChannel
        const embed = this.constructStarboardEmbed(reaction as MessageReaction, sentLayer)
        await channelToSend.send({embeds: [embed]})
      }
    }
  }
}