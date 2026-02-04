import {randomId} from "@welshman/lib"

export type NotificationData = {
  id: string
  relay: string
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
