import "dotenv/config"

import {Hono} from "hono"
import {cors} from "hono/cors"
import {HTTPException} from "hono/http-exception"
import {z} from "zod"
import {serve} from "@hono/node-server"
import {zValidator} from "@hono/zod-validator"
import {now, ms} from "@welshman/lib"
import type {Subscription} from "./domain.js"
import * as domain from "./domain.js"
import * as database from "./database.js"
import * as notifications from "./notifications.js"

process.on("unhandledRejection", (error: Error) => {
  console.error("Unhandled rejection:", error.stack)
  process.exit(1)
})

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught exception:", error.stack)
  process.exit(1)
})

if (!process.env.BASE_URL) throw new Error("BASE_URL is not defined.")

const makeCallbackUrl = (sub: Subscription) => `${process.env.BASE_URL}/notify/${sub.id}`

const app = new Hono()

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  }),
)

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

  console.log(`Created vapid subscription ${sub.id}`)

  return c.json({key: sub.key, callback})
})

const setupApnsSchema = z.object({
  token: z.string(),
})

app.post("/subscription/apns", zValidator("json", setupApnsSchema), async c => {
  const apns = c.req.valid("json")
  const subscription = domain.makeAPNSSubscription(apns)
  const sub = await database.insertSubscription(subscription)
  const callback = makeCallbackUrl(sub)

  console.log(`Created apns subscription ${sub.id}`)

  return c.json({key: sub.key, callback})
})

const setupFcmSchema = z.object({
  token: z.string(),
})

app.post("/subscription/fcm", zValidator("json", setupFcmSchema), async c => {
  const fcm = c.req.valid("json")
  const subscription = domain.makeFCMSubscription(fcm)
  const sub = await database.insertSubscription(subscription)
  const callback = makeCallbackUrl(sub)

  console.log(`Created fcm subscription ${sub.id}`)

  return c.json({key: sub.key, callback})
})

app.get("/subscription/:key", async c => {
  const key = c.req.param("key")
  const subscription = await database.getSubscriptionByKey(key)

  if (!subscription) {
    throw new HTTPException(404)
  }

  console.log(`Fetched subscription ${subscription.id}`)

  return c.json({callback: makeCallbackUrl(subscription)})
})

app.delete("/subscription/:key", async c => {
  const sub = await database.deleteSubscription(c.req.param("key"))

  if (!sub) {
    throw new HTTPException(404)
  }

  console.log(`Deleted subscription ${sub.id}`)

  return c.json({ok: true})
})

const notifySchema = z.object({
  id: z.string(),
  relay: z.string(),
  pubkey: z.string(),
  payload: z.string(),
})

const seen = new Map<string, number>()

setTimeout(() => {
  const since = now() - 300

  for (const [k, t] of seen.entries()) {
    if (t < since) {
      seen.delete(k)
    }
  }
}, ms(30))

app.post("/notify/:id", zValidator("json", notifySchema), async c => {
  const subscriptionId = c.req.param("id")
  const {id, relay, pubkey, payload} = c.req.valid("json")
  const key = `${subscriptionId}:${id}`

  if (!seen.has(key)) {
    seen.set(key, now())

    const sub = await database.getSubscriptionById(id)

    if (!sub) {
      throw new HTTPException(404)
    }

    console.log(`Processing notification for subscription ${sub.id}`)

    await notifications.send(sub, {id, relay, pubkey, payload})
  }

  return c.json({ok: true})
})

const port = process.env.PORT || 3000

database.migrate().then(() => {
  serve({
    fetch: app.fetch,
    port: Number(port),
  })

  console.log("Running on port", port)
})
