import {SimpleCommandMessage} from "discordx"
import logger from "pino"
import pino from "pino"
import {CommandInteraction, DMChannel, GuildBasedChannel, GuildMember} from "discord.js"

// from https://getpino.io/#/docs/help?id=mapping-pino-log-levels-to-google-cloud-logging-stackdriver-serverity-levels
const PinoLevelToSeverityLookup: {[key: string]: string} = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
}

const defaultPinoConf = {
  messageKey: 'message',
  formatters: {
    level(label: string, number: number) {
      return {
        severity: PinoLevelToSeverityLookup[label] || PinoLevelToSeverityLookup['info'],
        level: number,
      }
    },
    log(message: any) {
      return { message }
    }
  },
}

export const LOG = pino(Object.assign({}, defaultPinoConf, defaultPinoConf))

export const newLogger = (command: string) => LOG.child({ cmd: command })
export const traceCommand = (logger: logger.Logger, command: CommandInteraction ) => {
  if (!(command.channel?.partial)) {
    const channel = command.channel as GuildBasedChannel
    const member = command.member as GuildMember
    logger.info({
      user: member.id,
      command: command.options.data,
      guildName: command.guild?.name || "Guild name unknown",
      guildId: command.guildId,
      channelName: channel.name,
      channelId: channel.id,
      timestamp: command.createdTimestamp
    })
  }
}