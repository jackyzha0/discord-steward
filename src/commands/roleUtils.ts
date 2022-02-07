import ColorHash from "color-hash-ts"
import {
  ColorResolvable,
  CommandInteraction,
  GuildBasedChannel,
  GuildChannel, GuildChannelManager,
  Role,
  SelectMenuInteraction
} from "discord.js"
import {newLogger} from "../logging"

const LOG = newLogger('Util')

export const colorHash = new ColorHash({ lightness: 0.6, saturation: 0.4 })
export function channelToRole(channelName: string): string | undefined {
  return /^🌿[-_\s]([\S\s-_]+)/g.exec(channelName)?.[1].replace(/[-_\s]/i, " ")
}

export function isWorkFlow(c: GuildBasedChannel | GuildChannel | null): boolean {
  return !!c?.name.startsWith("🌿")
}

export interface Layer {
  depth: number
  channel: GuildBasedChannel
  roleName: string
  feedName: string | undefined
}

export function serverChannels(interaction: CommandInteraction | SelectMenuInteraction) {
  return [...interaction.guild?.channels.cache.values() || []]
}

export function serverRoles(interaction: CommandInteraction | SelectMenuInteraction) {
  return [...interaction.guild?.roles.cache.values() || []]
}

export function guildLayerMap(channels: GuildChannelManager | undefined) {
  if (!channels) {
    return {}
  }
  return [...channels.cache.values()]
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
            feedName: parentRoleName,
          })
          total[id] = total[id].sort((a, b) => a.depth - b.depth)
        }
      }
      return total
    }, {})
}

export function getLayerMap(interaction: CommandInteraction | SelectMenuInteraction) {
  return guildLayerMap(interaction.guild?.channels)
}

export function getFeedChannels(interaction: CommandInteraction | SelectMenuInteraction) {
  const channels = serverChannels(interaction)
  return channels
    .filter(c => c.type === "GUILD_CATEGORY")
    .filter(isWorkFlow)
}

export async function fixRolesAndPermissions(interaction: SelectMenuInteraction | CommandInteraction, force = false) {
  let roles = serverRoles(interaction)
  const layerMap = getLayerMap(interaction)
  const layerRoles = Object.values(layerMap)
    .flat()
    .map(l => ({
      color: colorHash.hex(l.feedName || ""),
      name: l.roleName
    }))

  const rolesToMake = layerRoles.filter(role => !roles.map(r => r.name).includes(role.name || ""))

  // early return if all roles are setup (and not forced)
  if (rolesToMake.length === 0 && !force) {
    return
  }

  // create missing roles
  await Promise.all(rolesToMake
    .map(role => interaction.guild?.roles.create({
      name: role.name,
      color: role.color as ColorResolvable,
      reason: "Steward feed role creation",
    })))
  LOG.info({
    event: `created ${rolesToMake.length} missing roles`,
    rolesCreated: rolesToMake
  })

  // bot role + refresh roles after creating new ones
  roles = serverRoles(interaction)
  const getRoleByName = (name: string) => roles.find(r => r.name === name) as Role
  const botRole = getRoleByName("Steward")

  // bind feed channels to roles
  const channels = serverChannels(interaction)
  const findChannelById = (id: string) => channels.find(c => c.id === id) as GuildChannel
  Object.keys(layerMap).forEach(feedCategoryId => {
    // by default, hide from all, allow bot to view
    const cat = findChannelById(feedCategoryId)
    cat.permissionOverwrites.create(botRole, { VIEW_CHANNEL: true })

    if (isWorkFlow(cat)) {
      cat.permissionOverwrites.create(cat.guild.roles.everyone, { VIEW_CHANNEL: false })

      // cascade depth role permissions
      const layers = layerMap[feedCategoryId]
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
  return rolesToMake
}