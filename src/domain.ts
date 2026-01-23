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
  const sk = makeSecret()
  const pk = getPubkey(sk)

  return {sk, pk, errors: 0}
}

export const makeVapidSubscription = (data: VapidData): VapidSubscription =>
  ({...makeBaseSubscription(), channel: Channel.Vapid, data})

export const makeAPNSSubscription = (data: APNSData): APNSSubscription =>
  ({...makeBaseSubscription(), channel: Channel.APNS, data})

export const makeFCMSubscription = (data: FCMData): FCMSubscription =>
  ({...makeBaseSubscription(), channel: Channel.FCM, data})
