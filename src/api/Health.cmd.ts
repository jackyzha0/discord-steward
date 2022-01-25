import { Get, Router } from "@discordx/koa"
import type { Context } from "koa"

@Router()
export class API {
  @Get("/")
  index(context: Context) {
    context.body = "ok";
  }
}