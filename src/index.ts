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

const eventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string(),
})

const notifySchema = z.object({
  id: z.string(),
  relay: z.string(),
  event: eventSchema.optional(),
})

const seen = new Map<string, number>()

setInterval(() => {
  const since = now() - 300

  for (const [k, t] of seen.entries()) {
    if (t < since) {
      seen.delete(k)
    }
  }
}, ms(30))

app.post("/notify/:id", zValidator("json", notifySchema), async c => {
  const subid = c.req.param("id")
  const {id, relay, event} = c.req.valid("json")
  const key = `${subid}:${id}`

  if (!seen.has(key)) {
    seen.set(key, now())

    const sub = await database.getSubscriptionById(subid)

    if (!sub) {
      throw new HTTPException(404)
    }

    console.log(`Processing notification for subscription ${subid}`)

    const json = event && JSON.stringify(event)
    const data = domain.makeNotificationData({id, relay, event: json})

    await notifications.send(sub, data, {
      title: "New activity",
      body: domain.makeNotificationBody(event),
    })
  }

  return c.json({ok: true})
})

const scheduleSchema = z.object({
  id: z.string(),
  relay: z.string(),
  event: eventSchema.optional(),
  notifications: z
    .array(
      z.object({
        at: z.number(),
        title: z.string(),
        body: z.string().optional(),
      }),
    )
    .max(20),
})

app.put("/subscription/:key/schedule", zValidator("json", scheduleSchema), async c => {
  const sub = await database.getSubscriptionByKey(c.req.param("key"))

  if (!sub) {
    throw new HTTPException(404)
  }

  const {id, relay, event, notifications} = c.req.valid("json")
  const json = event && JSON.stringify(event)
  const schedules = notifications.map(n => ({...n, relay, event: json}))

  await database.replaceSchedules(sub.id, id, schedules)
  await armSweep()

  console.log(`Scheduled ${schedules.length} notifications for subscription ${sub.id}`)

  return c.json({ok: true})
})

app.delete("/subscription/:key/schedule", async c => {
  const sub = await database.getSubscriptionByKey(c.req.param("key"))

  if (!sub) {
    throw new HTTPException(404)
  }

  await database.deleteSchedules(sub.id)

  console.log(`Dropped every scheduled notification for subscription ${sub.id}`)

  return c.json({ok: true})
})

// A single timer waits for the earliest schedule. Waits are capped at a day since setTimeout can't
// go past ~24.8 days, and floored at a second so a schedule that isn't quite due can't spin.
const MAX_SWEEP_DELAY = 86400

let sweepAt = Infinity
let sweepTimer: NodeJS.Timeout | undefined

// Only ever pulls the timer earlier. A timer left behind by a deleted schedule fires a sweep that
// finds nothing and arms the timer again.
const armSweep = async () => {
  const at = await database.getNextScheduleAt()

  if (at !== undefined && at < sweepAt) {
    const delay = Math.min(Math.max(at - now(), 1), MAX_SWEEP_DELAY)

    clearTimeout(sweepTimer)
    sweepAt = now() + delay
    sweepTimer = setTimeout(sweep, ms(delay))
  }
}

// A schedule is dropped before it is sent, so a send that throws loses one notification rather
// than repeating it every sweep. Only the sweep whose delete lands sends it, so overlapping sweeps
// can't send it twice.
const sweep = async () => {
  sweepAt = Infinity

  for (const schedule of await database.getDueSchedules(now())) {
    if (!(await database.deleteSchedule(schedule.id))) continue

    const sub = await database.getSubscriptionById(schedule.subscriptionId)

    if (sub) {
      const {eventId: id, relay, event, title, body} = schedule
      const data = domain.makeNotificationData({id, relay, event})

      await notifications.send(sub, data, {title, body})
    }
  }

  await armSweep()
}

const port = process.env.PORT || 3000

database.migrate().then(async () => {
  await armSweep()

  serve({
    fetch: app.fetch,
    port: Number(port),
  })

  console.log("Running on port", port)
})
