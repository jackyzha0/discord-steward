import "dotenv/config"
import "reflect-metadata"
import path from "path"
import {ColorResolvable, CommandInteraction, Intents, Interaction, Message} from "discord.js"
import { Client } from "discordx"
import { importx } from "@discordx/importer"
import {LOG} from "./logging"
import {Koa} from "@discordx/koa";
import {getP0Roles} from "./commands/roleUtils";

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
  botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],
})

client.once("ready", async () => {
  await client.guilds.fetch()

  await client.initApplicationCommands({
    guild: { log: true },
    global: { log: true },
  })
  await client.initApplicationPermissions()
  client.user?.setActivity("/steward help")

  LOG.info("Steward started up correctly.")
})

client.on("interactionCreate", (interaction: Interaction) => {
  (client.executeInteraction(interaction) as Promise<any>).catch(err => {
    (interaction as CommandInteraction).editReply({content: "⚠️ Uh-oh! We encountered a permission error, please let your server admin know."})
    return LOG.error(err)
  })
})

client.on("messageCreate", (message: Message) => {
  client.executeCommand(message).catch(err => {
    return LOG.error(err)
  })
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

