import "dotenv/config"
import apn from "apn"
import webpush from "web-push"
import fcm from "firebase-admin"
import {WRAP, SignedEvent} from "@welshman/util"
import {parse, truncate, renderAsText} from "@welshman/content"
import {NotificationData, Channel, VapidSubscription, APNSSubscription, FCMSubscription, Subscription} from "./domain.js"
import database from './database.js'

if (!process.env.VAPID_PRIVATE_KEY) throw new Error("VAPID_PRIVATE_KEY is not defined.")
if (!process.env.VAPID_PUBLIC_KEY) throw new Error("VAPID_PUBLIC_KEY is not defined.")
if (!process.env.VAPID_SUBJECT) throw new Error("VAPID_SUBJECT is not defined.")
if (!process.env.FCM_KEY) throw new Error("FCM_KEY is not defined.")
if (!process.env.APN_KEY) throw new Error("APN_KEY is not defined.")
if (!process.env.APN_KEY_ID) throw new Error("APN_KEY_ID is not defined.")
if (!process.env.APN_TEAM_ID) throw new Error("APN_TEAM_ID is not defined.")
if (!process.env.APN_PRODUCTION) throw new Error("APN_PRODUCTION is not defined.")

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

fcm.initializeApp({
  credential: fcm.credential.cert(JSON.parse(process.env.FCM_KEY)),
})

const apnProvider = new apn.Provider({
  production: process.env.APN_PRODUCTION === "true",
  token: {
    key: process.env.APN_KEY,
    keyId: process.env.APN_KEY_ID,
    teamId: process.env.APN_TEAM_ID,
  },
})

const getNotificationBody = (event: SignedEvent) => {
  if (event.kind === WRAP) {
    return ""
  }

  const parsed = truncate(parse(event), {
    minLength: 50,
    maxLength: 200,
  })

  const renderer = renderAsText(parsed, {
    createElement: tag => ({
      _text: "",
      set innerText(text: string) {
        this._text = text
      },
      get innerHTML() {
        return this._text
      },
    }),
  })

  return renderer.toString()
}

const sendVapidNotification = async (subscription: VapidSubscription, data: NotificationData) => {
  const config = {
    endpoint: subscription.data.endpoint,
    keys: {
      auth: subscription.data.auth,
      p256dh: subscription.data.p256dh,
    },
  }

  const payload = JSON.stringify({
    title: "New activity",
    body: getNotificationBody(data.event),
    relay: data.relay,
    event: data.event,
  })

  try {
    await webpush.sendNotification(config, payload)

    if (subscription.errors > 0) {
      await database.resetSubscriptionErrors(subscription.pk)
    }
  } catch (error: any) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      await database.deleteSubscription(subscription.pk)
    } else if (subscription.errors > 10) {
      await database.deleteSubscription(subscription.pk)
    } else {
      await database.incrementSubscriptionErrors(subscription.pk)
    }

    console.log("Failed to send web push notification", error.message, error.statusCode)
  }
}

const sendAPNSNotification = async (subscription: APNSSubscription, data: NotificationData) => {
  let notification = new apn.Notification({
    topic: subscription.data.topic,
    sound: "default",
    badge: 1,
    alert: {
      title: "New activity",
      body: getNotificationBody(data.event),
    },
    payload: {
      relay: data.relay,
      event: JSON.stringify(data.event),
    },
  })

  const {failed} = await apnProvider.send(notification, subscription.data.token)

  if (failed.length > 0) {
    const failure = failed[0]

    if (subscription.errors > 10) {
      await database.deleteSubscription(subscription.pk)
    } else if (failure.response) {
      const status = failure.status
      const reason = failure.response.reason

      if (status === '410' || reason === 'Unregistered' ||
          reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic') {
        await database.deleteSubscription(subscription.pk)
      } else if (status === '429' || status === '500' || status === '503') {
        await database.incrementSubscriptionErrors(subscription.pk)
      }
    } else if (failure.error) {
      await database.incrementSubscriptionErrors(subscription.pk)
    }

    console.log("Failed to send apns push notification", failure.response?.reason)
  } else if (subscription.errors > 0) {
    await database.resetSubscriptionErrors(subscription.pk)
  }
}

const sendFCMNotification = async (subscription: FCMSubscription, data: NotificationData) => {
  try {
    await fcm.messaging().send({
      token: subscription.data.token,
      notification: {
        title: "New activity",
        body: getNotificationBody(data.event),
      },
      data: {
        relay: data.relay,
        event: JSON.stringify(data.event),
      },
      android: {
        priority: "high" as const,
      },
    })

    if (subscription.errors > 0) {
      await database.resetSubscriptionErrors(subscription.pk)
    }
  } catch (error: any) {
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await database.deleteSubscription(subscription.pk)
    } else if (error.code === 'messaging/server-unavailable' ||
             error.code === 'messaging/internal-error') {
      await database.incrementSubscriptionErrors(subscription.pk)
    }

    console.error('Failed to send fcm push notification', error.code, error.message)
  }
}

export default {
  send: (subscription: Subscription, data: NotificationData) => {
    switch (subscription.channel) {
      case Channel.Vapid:
        return sendVapidNotification(subscription, data)
      case Channel.APNS:
        return sendAPNSNotification(subscription, data)
      case Channel.FCM:
        return sendFCMNotification(subscription, data)
    }
  },
}
