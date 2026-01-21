import {makeSecret, getPubkey} from '@welshman/util'
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
  pk: string
  sk: string
  pubkey: string
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

const makeBaseSubscription = (pubkey: string): BaseSubscription => {
  const sk = makeSecret()
  const pk = getPubkey(sk)

  return {sk, pk, pubkey, errors: 0}
}

export const makeVapidSubscription = (pubkey: string, data: VapidData): VapidSubscription =>
  ({...makeBaseSubscription(pubkey), channel: Channel.Vapid, data})

export const makeAPNSSubscription = (pubkey: string, data: APNSData): APNSSubscription =>
  ({...makeBaseSubscription(pubkey), channel: Channel.APNS, data})

export const makeFCMSubscription = (pubkey: string, data: FCMData): FCMSubscription =>
  ({...makeBaseSubscription(pubkey), channel: Channel.FCM, data})

export default {
  makeVapidSubscription,
  makeAPNSSubscription,
  makeFCMSubscription,
}
