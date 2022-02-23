import ColorHash from "color-hash-ts"
import {
  ColorResolvable,
  CommandInteraction, Guild,
  GuildBasedChannel,
  GuildChannel, GuildChannelManager, GuildMemberRoleManager,
  Role,
  SelectMenuInteraction
} from "discord.js"
import {newLogger} from "../logging"

const LOG = newLogger('Util')

export const colorHash = new ColorHash({ lightness: 0.6, saturation: 0.4 })

export function channelToRole(channelName: string): string | undefined {
  return /^🌿[-_\s]([\S\s-_]+)/g.exec(channelName)?.[1].replace(/[-_\s]/i, " ")
}

export function getPaceChannelDepth(c: GuildBasedChannel | GuildChannel | null): false | number {
  const parsedString = c?.name.match(/p(\d+)/)?.[1]
  return parsedString ? parseInt(parsedString) : false
}

export function getPaceRoleDepthFromString(sr: string): false | number {
  const parsedString = sr.match(/ P(\d+)$/)?.[1]
  return parsedString ? parseInt(parsedString) : false
}

export function getPaceRoleDepth(r: Role): false | number {
  return getPaceRoleDepthFromString(r.name)
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

export function getServerChannels(g: Guild) {
  return [...g.channels.cache.values() || []]
}

export function getServerRoles(g: Guild) {
  return [...g.roles.cache.values() || []]
}

export function getServerMembers(g: Guild) {
  return [...g.members.cache.values() || []]
}

export function getLayerMap(g: Guild) {
  const channels = g.channels
  if (!channels) {
    return {}
  }
  return [...channels.cache.values()]
    .reduce<{ [key: string]: Layer[] }>((total, cur) => {
      if (cur.type === "GUILD_CATEGORY") {
        total[cur.id] = []
      } else {
        const depth = getPaceChannelDepth(cur)
        if (depth) {
          const parentRoleName = channelToRole(cur.parent?.name || "")
          const id = cur.parentId ?? ""
          total[id].push({
            depth,
            channel: cur,
            roleName: `${parentRoleName} P${depth}`,
            feedName: parentRoleName,
          })
          total[id] = total[id].sort((a, b) => a.depth - b.depth)
        }
      }
      return total
    }, {})
}

export function getFeedChannels(g: Guild) {
  const channels = getServerChannels(g)
  return channels
    .filter(c => c.type === "GUILD_CATEGORY")
    .filter(isWorkFlow)
}

export function getP0Roles(g: Guild) {
  const roles = getServerRoles(g)
  return roles
    .filter(r => getPaceRoleDepth(r) === 0)
}

export async function fixRolesAndPermissions(g: Guild, force = false) {
  let roles = getServerRoles(g)
  const layerMap = getLayerMap(g)
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
    .map(role => g.roles.create({
      name: role.name,
      color: role.color as ColorResolvable,
      reason: "Steward feed role creation",
    })))
  LOG.info({
    event: `created ${rolesToMake.length} missing roles`,
    rolesCreated: rolesToMake
  })

  // assign p0 roles to everyone
  const p0Roles = getP0Roles(g)
  const allMembers = getServerMembers(g)
  await Promise.all(allMembers.map(member => member.roles.add(p0Roles)))
  LOG.info({
    event: `Added ${p0Roles.length} P0 roles to all users: ${p0Roles.map(r => r.name).join(", ")}`,
    rolesCreated: rolesToMake
  })

  // bot role + refresh roles after creating new ones
  roles = getServerRoles(g)
  const getRoleByName = (name: string) => roles.find(r => r.name === name) as Role
  const botRole = getRoleByName("Steward")

  // bind feed channels to roles
  const channels = getServerChannels(g)
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