import {makeSecret} from '@welshman/util'
import type {SignedEvent} from '@welshman/util'

export type NotificationData = {
  relay: string
  event: SignedEvent
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
  topic: string
  token: string
}

export type FCMData = {
  token: string
}

export type BaseSubscription = {
  id: string
  pubkey: string
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

export const makeVapidSubscription = (pubkey: string, data: VapidData): VapidSubscription => ({
  id: makeSecret(),
  channel: Channel.Vapid,
  pubkey,
  data,
})

export const makeAPNSSubscription = (pubkey: string, data: APNSData): APNSSubscription => ({
  id: makeSecret(),
  channel: Channel.APNS,
  pubkey,
  data,
})

export const makeFCMSubscription = (pubkey: string, data: FCMData): FCMSubscription => ({
  id: makeSecret(),
  channel: Channel.FCM,
  pubkey,
  data,
})

export default {
  makeVapidSubscription,
  makeAPNSSubscription,
  makeFCMSubscription,
}
