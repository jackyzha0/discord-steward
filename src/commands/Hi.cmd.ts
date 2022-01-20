import { CommandInteraction, Message } from "discord.js";
import {
  Discord,
  SimpleCommand,
  SimpleCommandMessage,
  SimpleCommandOption,
} from "discordx";
import {newLogger, trace} from "../logging";

const LOG = newLogger('Hi')

@Discord()
class simpleCommandExample {
  @SimpleCommand("hello", { aliases: ["hi"] })
  hello(command: SimpleCommandMessage) {
    trace(LOG, command)
    command.message.reply(`👋 ${command.message.member}`);
  }

  @SimpleCommand("sum", { argSplitter: " " })
  sum(
    @SimpleCommandOption("num1", { type: "NUMBER" }) num1: number | undefined,
    @SimpleCommandOption("num2", { type: "NUMBER" }) num2: number | undefined,
    command: SimpleCommandMessage
  ) {
    trace(LOG, command)
    if (!num1 || !num2) {
      return command.sendUsageSyntax();
    }
    command.message.reply(`total = ${num1 + num2}`);
  }
}