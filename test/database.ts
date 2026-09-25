import assert from "node:assert"
import {mkdtempSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "nps-test-"))

const database = await import("../src/database.js")
const domain = await import("../src/domain.js")

await database.migrate()

const sub = await database.insertSubscription(domain.makeFCMSubscription({token: "token"}))
const other = await database.insertSubscription(domain.makeFCMSubscription({token: "other"}))

const schedule = (at: number, title: string) => ({relay: "wss://relay.test/", title, at})

await database.replaceSchedules(sub.id, "event", [schedule(100, "first"), schedule(300, "second")])

assert.deepEqual(
  (await database.getDueSchedules(200)).map(s => s.title),
  ["first"],
)

// A second call replaces what the first scheduled rather than adding to it.
await database.replaceSchedules(sub.id, "event", [schedule(50, "third")])

assert.deepEqual(
  (await database.getDueSchedules(500)).map(s => s.title),
  ["third"],
)

// Schedules are scoped to one event, so another event's are left alone.
await database.replaceSchedules(sub.id, "other-event", [schedule(60, "fourth")])
await database.replaceSchedules(sub.id, "event", [])

assert.deepEqual(
  (await database.getDueSchedules(500)).map(s => s.title),
  ["fourth"],
)

const [due] = await database.getDueSchedules(500)

assert.equal(due.subscriptionId, sub.id)
assert.equal(due.eventId, "other-event")
assert.equal(due.relay, "wss://relay.test/")
assert.equal(due.event, undefined)
assert.equal(due.body, undefined)

await database.replaceSchedules(other.id, "event", [schedule(70, "fifth")])
await database.deleteSchedules(sub.id)

assert.deepEqual(
  (await database.getDueSchedules(500)).map(s => s.title),
  ["fifth"],
)

assert.equal(await database.getNextScheduleAt(), 70)

// Deleting a subscription takes its schedules with it.
await database.deleteSubscription(other.key)

assert.deepEqual(await database.getDueSchedules(500), [])
assert.equal(await database.getNextScheduleAt(), undefined)

console.log("ok")
