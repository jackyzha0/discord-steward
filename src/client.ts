import "dotenv/config"
import "reflect-metadata"
import path from "path"
import {ColorResolvable, CommandInteraction, Intents, Interaction, Message} from "discord.js"
import { Client } from "discordx"
import { importx } from "@discordx/importer"
import {LOG} from "./logging"
import {Koa} from "@discordx/koa"
import {
  channelToRole,
  colorHash,
  getLayerMap,
  getP0Roles,
  getServerRoles,
  setLayerProperties
} from "./commands/roleUtils"

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
})

client.once("ready", async () => {
  await client.guilds.fetch()
  await client.initApplicationCommands({
    global: { log: true },
  })
  await client.initApplicationPermissions()
  client.user?.setActivity("/steward help")

  LOG.info("Steward started up correctly.")
})

function dumpError(err: unknown) {
  const obj = JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)))
  obj.stack = obj.stack.split("\n    ")
  return obj
}

// listen for reactions/button clicks
client.on("interactionCreate", (interaction: Interaction) => {
  (client.executeInteraction(interaction) as Promise<any>).catch(err => {
    (interaction as CommandInteraction).editReply({content: "⚠️ Uh-oh! We encountered a permission error, please let your server admin know."})
    return LOG.error(dumpError(err))
  })
})

// listen for slash commands
client.on("messageCreate", (message: Message) => {
  client.executeCommand(message).catch(err => {
    return LOG.error(dumpError(err))
  })
})

// listen for channel updates
client.on("channelCreate", async chan => {
  LOG.info({
    event: "channel creation",
    guild: chan.guild.name,
    guildId: chan.guildId,
    channelId: chan.id,
    channel: chan.name,
  })
  const roleName = channelToRole(chan.name)
  const layerMap = getLayerMap(chan.guild)
  if (roleName && chan.parentId && layerMap[chan.parentId]) {
    // create associated role
    await chan.guild.roles.create({
      color: colorHash.hex(chan.parent?.name || "") as ColorResolvable,
      name: roleName
    })

    // set permissions + slowmode
    await setLayerProperties(chan.guild)
  }
})

client.on("channelDelete", async chan => {
  if (chan.type !== "DM") {
    LOG.info({
      event: "channel deletion",
      guild: chan.guild.name,
      guildId: chan.guildId,
      channelId: chan.id,
      channel: chan.name,
    })
    const roleName = channelToRole(chan.name)
    const guild = chan.guild
    if (roleName) {
      const guildRoles = getServerRoles(guild)
      await guildRoles.find(r => r.name === roleName)?.delete()
      LOG.info({
        event: "role deletion",
        guild: chan.guild.name,
        guildId: chan.guildId,
        role: roleName
      })
      await setLayerProperties(guild)
    }
  }
})

// default roles
client.on("guildMemberAdd", async member => {
  const guild = member.guild
  const rolesToAdd = getP0Roles(guild)
  await member.roles.add(rolesToAdd)
  LOG.info(`Added ${rolesToAdd.length} P0 roles to user ${member.displayName}: ${rolesToAdd.map(r => r.name).join(", ")}`)
})

async function run() {
  await importx(path.join(__dirname, "{commands,api}", "**/*.cmd.{ts,js}"))
  await client.login(process.env.TOKEN ?? "")

  const server = new Koa()
  await server.build()
  const port = process.env.PORT ?? 8080
  server.listen(port, () => {
    LOG.info(`api server started on ${port}`)
  })
}

run()

