import {ArgsOf, Discord, On} from "discordx"
import {GuildChannel, MessageEmbed, MessageReaction, TextBasedChannel} from "discord.js"
import {dedupe, getLayerMap, getPaceChannelDepth, Layer} from "./roleUtils";
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
      .setFooter({ text: `___\nSurfaced from #${layer.channel.name} in pace layer ${layer.depth} of ${layer.feedName}. Can't see this channel? Try setting the right pace layer by doing /pace set` })

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
    const guild = reaction.message.guild
    if (guild) {
      const isSparkle = reaction.emoji.name === "✨"
      if (isSparkle) {
        if (reaction.partial) {
          await reaction.fetch()
        }

        const sentChannel = reaction.message.channel as GuildChannel
        const channelSize = sentChannel.members.filter(m => !m.user.bot).size

        if (sentChannel.parentId) {
          const layers = dedupe(Object.values(getLayerMap(guild)[sentChannel.parentId]), "roleName")

          // f(x) = ceil(1.3*sqrt(x/2))
          const isHighSignal = (reaction.count || 0) === Math.ceil(1.3 * Math.sqrt(channelSize / 2))

          LOG.info({
            type: "reaction",
            isHighSignal,
            sentChannel: sentChannel.id,
            count: reaction.count,
          })

          if (isHighSignal) {
            const sentLayer = layers.find(l => l.depth === getPaceChannelDepth(sentChannel)) as Layer
            const feedLayers = layers
              .filter(l => l.feedName === sentLayer.feedName)
              .sort((a, b) => a.depth - b.depth)

            // fn to get index of chan id
            const indexOfChan = (chan: GuildChannel) => {
              return feedLayers.findIndex(l => l.depth === getPaceChannelDepth(chan))
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
  }
}