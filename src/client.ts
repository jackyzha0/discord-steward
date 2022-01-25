import "dotenv/config"
import "reflect-metadata"
import path from "path"
import { Intents, Interaction, Message } from "discord.js"
import { Client } from "discordx"
import { importx } from "@discordx/importer"
import {LOG} from "./logging"
import {Koa} from "@discordx/koa";

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
  try {
    client.executeInteraction(interaction)
  } catch (err) {
    LOG.error(err)
  }
})

client.on("messageCreate", (message: Message) => {
  client.executeCommand(message).catch(err => LOG.error(err))
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

