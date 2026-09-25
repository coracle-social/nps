import {ellipsize, randomId} from "@welshman/lib"
import {WRAP} from "@welshman/util"
import {renderEventAsSummary} from "./render.js"

export type NotificationEvent = {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export type NotificationData = {
  id: string
  relay: string
  event?: string
}

export type NotificationContent = {
  title: string
  body?: string
}

export type Schedule = {
  id: string
  subscriptionId: string
  eventId: string
  relay: string
  event?: string
  title: string
  body?: string
  at: number
}

const MAX_EVENT_BYTES = 3800

const PREVIEW_LENGTH = 120

export const makeNotificationData = ({id, relay, event}: NotificationData): NotificationData =>
  event && Buffer.byteLength(event) <= MAX_EVENT_BYTES ? {id, relay, event} : {id, relay}

export const makeNotificationBody = (event?: NotificationEvent) => {
  const summary = event && event.kind !== WRAP ? renderEventAsSummary(event) : ""

  return summary ? ellipsize(summary, PREVIEW_LENGTH, "…") : undefined
}

export enum Channel {
  Vapid = "vapid",
  APNS = "apns",
  FCM = "fcm",
}

export type VapidData = {
  endpoint: string
  p256dh: string
  auth: string
}

export type APNSData = {
  token: string
}

export type FCMData = {
  token: string
}

export type BaseSubscription = {
  id: string
  key: string
  errors: number
}

export type VapidSubscription = BaseSubscription & {
  channel: Channel.Vapid
  data: VapidData
}

export type APNSSubscription = BaseSubscription & {
  channel: Channel.APNS
  data: APNSData
}

export type FCMSubscription = BaseSubscription & {
  channel: Channel.FCM
  data: FCMData
}

export type Subscription = VapidSubscription | APNSSubscription | FCMSubscription

const makeBaseSubscription = (): BaseSubscription => {
  const id = randomId()
  const key = randomId()

  return {id, key, errors: 0}
}

export const makeVapidSubscription = (data: VapidData): VapidSubscription => ({
  ...makeBaseSubscription(),
  channel: Channel.Vapid,
  data,
})

export const makeAPNSSubscription = (data: APNSData): APNSSubscription => ({
  ...makeBaseSubscription(),
  channel: Channel.APNS,
  data,
})

export const makeFCMSubscription = (data: FCMData): FCMSubscription => ({
  ...makeBaseSubscription(),
  channel: Channel.FCM,
  data,
})
