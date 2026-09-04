import assert from "node:assert"
import {makeNotificationData} from "../src/domain.js"

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
const multibyte = makeEvent(0).replace('"content":""', `"content":"${"Ž".repeat(1950)}"`)

assert.deepEqual(makeNotificationData({id, relay}), {id, relay})

assert.deepEqual(makeNotificationData({id, relay, event: small}), {id, relay, event: small})

assert.deepEqual(makeNotificationData({id, relay, event: large}), {id, relay})

assert.equal(multibyte.length < 3800, true)
assert.equal(Buffer.byteLength(multibyte) > 3800, true)
assert.deepEqual(makeNotificationData({id, relay, event: multibyte}), {id, relay})

console.log("ok")
