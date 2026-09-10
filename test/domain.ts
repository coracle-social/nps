import assert from "node:assert"
import {makeNotificationBody, makeNotificationData} from "../src/domain.js"

const id = "a".repeat(64)
const relay = "wss://relay.example.com/"

const makeEvent = (contentBytes: number) =>
  JSON.stringify({
    id,
    pubkey: "b".repeat(64),
    created_at: 1788559000,
    kind: 9,
    tags: [["h", "c".repeat(64)]],
    content: "x".repeat(contentBytes),
    sig: "d".repeat(128),
  })

const small = makeEvent(100)
const large = makeEvent(4000)
const multibyte = makeEvent(0).replace('"content":""', `"content":"${"é".repeat(1950)}"`)

assert.deepEqual(makeNotificationData({id, relay}), {id, relay})

assert.deepEqual(makeNotificationData({id, relay, event: small}), {id, relay, event: small})

assert.deepEqual(makeNotificationData({id, relay, event: large}), {id, relay})

assert.equal(multibyte.length < 3800, true)
assert.equal(Buffer.byteLength(multibyte) > 3800, true)
assert.deepEqual(makeNotificationData({id, relay, event: multibyte}), {id, relay})

const makeRumor = (kind: number, content: string) => ({
  id,
  pubkey: "b".repeat(64),
  created_at: 1788559000,
  kind,
  tags: [],
  content,
  sig: "d".repeat(128),
})

const nevent = "nostr:nevent1qqs242424242424242424242424242424242424242424242424242s7c3tw2"

const npub = "nostr:npub1hwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwasxw04hu"

assert.equal(makeNotificationBody(undefined), undefined)

assert.equal(makeNotificationBody(makeRumor(9, "  hello there  ")), "hello there")

assert.equal(makeNotificationBody(makeRumor(9, "")), undefined)

assert.equal(makeNotificationBody(makeRumor(9, "\n\n  \n")), undefined)

assert.equal(makeNotificationBody(makeRumor(9, "first line\nsecond line")), "first line")

assert.equal(makeNotificationBody(makeRumor(1059, "gAaB".repeat(50))), undefined)

assert.equal(makeNotificationBody(makeRumor(9, "a < b && c")), "a < b && c")

// A reply prepends the message it answers, so its first line says nothing about the reply.
assert.equal(
  makeNotificationBody(
    makeRumor(9, `${nevent}\n\nsunday, the notice is at https://harbor.example/dock`),
  ),
  "sunday, the notice is at a link to harbor.example",
)

// Nothing but an entity still says more than the bech32 it is written as.
assert.equal(makeNotificationBody(makeRumor(9, nevent)), "another message")

assert.equal(
  makeNotificationBody(makeRumor(9, `${npub} are you around?`)),
  "someone are you around?",
)

assert.equal(
  makeNotificationBody(makeRumor(9, "here it is https://example.com/dock.jpg")),
  "here it is an image",
)

assert.equal(makeNotificationBody(makeRumor(9, "#dock is closed")), "dock is closed")

const long = makeNotificationBody(makeRumor(9, "word ".repeat(100))) || ""

assert.equal(long.endsWith("…"), true)
assert.equal(long.length < 140, true)

console.log("ok")
