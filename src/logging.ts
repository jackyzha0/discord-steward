import {SimpleCommandMessage} from "discordx";
import logger from "pino";
import pino from "pino";
import {DMChannel} from "discord.js";

// from https://getpino.io/#/docs/help?id=mapping-pino-log-levels-to-google-cloud-logging-stackdriver-serverity-levels
const PinoLevelToSeverityLookup: {[key: string]: string} = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

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
export const trace = (logger: logger.Logger, command: SimpleCommandMessage) => {
  const m = command.message
  if (!(m.channel instanceof DMChannel) && !(m.channel.partial)) {
    logger.info({
      user: m.member?.id,
      content: m.cleanContent,
      guildName: m.guild?.name || "Guild name unknown",
      guildId: m.guildId,
      channelName: m.channel.name,
      channelId: m.channelId,
      timestamp: m.createdTimestamp
    })
  }
}