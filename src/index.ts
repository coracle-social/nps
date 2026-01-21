import "dotenv/config"

import {Hono} from "hono"
import {HTTPException} from "hono/http-exception"
import {z} from "zod"
import {serve} from "@hono/node-server"
import {zValidator} from "@hono/zod-validator"
import {verifyEvent, getPubkey} from "@welshman/util"
import type {Subscription} from "./domain.js"
import domain from "./domain.js"
import database from "./database.js"
import notifications from "./notifications.js"

process.on("unhandledRejection", (error: Error) => {
  console.error("Unhandled rejection:", error.stack)
  process.exit(1)
})

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught exception:", error.stack)
  process.exit(1)
})

if (!process.env.BASE_URL) throw new Error("BASE_URL is not defined.")

const makeCallbackUrl = (sub: Subscription) => `${process.env.BASE_URL}/notify/${sub.pk}`

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  console.error("Unhandled error:", err.stack || err)

  return c.json({error: "Internal Server Error"}, 500)
})

const setupVapidSchema = z.object({
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
})

app.post("/subscription/vapid", zValidator("json", setupVapidSchema), async c => {
  const vapid = c.req.valid("json")
  const subscription = domain.makeVapidSubscription(vapid)
  const sub = await database.insertSubscription(subscription)
  const callback = makeCallbackUrl(sub)

  return c.json({sk: sub.sk, callback})
})

const setupApnsSchema = z.object({
  token: z.string(),
  topic: z.string(),
})

app.post("/subscription/apns", zValidator("json", setupApnsSchema), async c => {
  const apns = c.req.valid("json")
  const subscription = domain.makeAPNSSubscription(apns)
  const sub = await database.insertSubscription(subscription)
  const callback = makeCallbackUrl(sub)

  return c.json({sk: sub.sk, callback})
})

const setupFcmSchema = z.object({
  token: z.string(),
})

app.post("/subscription/fcm", zValidator("json", setupFcmSchema), async c => {
  const fcm = c.req.valid("json")
  const subscription = domain.makeFCMSubscription(fcm)
  const sub = await database.insertSubscription(subscription)
  const callback = makeCallbackUrl(sub)

  return c.json({sk: sub.sk, callback})
})

app.get("/subscription/:sk", async c => {
  const pk = getPubkey(c.req.param('sk'))
  const subscription = await database.getSubscription(pk)

  return c.json({exists: Boolean(subscription)})
})

app.delete("/subscription/:sk", async c => {
  const pk = getPubkey(c.req.param('sk'))

  await database.deleteSubscription(pk)

  return c.json({ok: true})
})

const notifySchema = z.object({
  relay: z.string(),
  event: z.object({
    id: z.string(),
    pubkey: z.string(),
    content: z.string(),
    tags: z.string().array().array(),
    created_at: z.int(),
    kind: z.int(),
    sig: z.string(),
  }),
})

app.post("/notify/:pk", zValidator("json", notifySchema), async c => {
  const pk = c.req.param("pk")
  const {relay, event} = c.req.valid("json")
  const sub = await database.getSubscription(pk)

  if (!verifyEvent(event)) {
    throw new HTTPException(400, {message: "Invalid event"})
  }

  if (!sub) {
    throw new HTTPException(404)
  }

  await notifications.send(sub, {relay, event})

  return c.json({ok: true})
})

const port = process.env.PORT || 3000

serve({
  fetch: app.fetch,
  port: Number(port),
})

console.log("Running on port", port)
