import "dotenv/config";

import apn from "apn";
import webpush from "web-push";
import fcm from "firebase-admin";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { WRAP, verifyEvent, getTagValue, SignedEvent } from "@welshman/util";
import { parse, truncate, renderAsText } from "@welshman/content";

process.on("unhandledRejection", (error: Error) => {
  console.error("Unhandled rejection:", error.stack);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught exception:", error.stack);
  process.exit(1);
});

if (!process.env.VAPID_PRIVATE_KEY)
  throw new Error("VAPID_PRIVATE_KEY is not defined.");
if (!process.env.VAPID_PUBLIC_KEY)
  throw new Error("VAPID_PUBLIC_KEY is not defined.");
if (!process.env.VAPID_SUBJECT)
  throw new Error("VAPID_SUBJECT is not defined.");
if (!process.env.FCM_KEY) throw new Error("FCM_KEY is not defined.");
if (!process.env.APN_KEY) throw new Error("APN_KEY is not defined.");
if (!process.env.APN_KEY_ID) throw new Error("APN_KEY_ID is not defined.");
if (!process.env.APN_TEAM_ID) throw new Error("APN_TEAM_ID is not defined.");
if (!process.env.APN_PRODUCTION)
  throw new Error("APN_PRODUCTION is not defined.");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

fcm.initializeApp({
  credential: fcm.credential.cert(JSON.parse(process.env.FCM_KEY)),
});

const apnProvider = new apn.Provider({
  production: process.env.APN_PRODUCTION === "true",
  token: {
    key: process.env.APN_KEY,
    keyId: process.env.APN_KEY_ID,
    teamId: process.env.APN_TEAM_ID,
  },
});

const getNotificationBody = (event: SignedEvent) => {
  if (event.kind === WRAP) {
    return "";
  }

  const parsed = truncate(parse(event), {
    minLength: 50,
    maxLength: 200,
  });

  const renderer = renderAsText(parsed, {
    createElement: (tag) => ({
      _text: "",
      set innerText(text: string) {
        this._text = text;
      },
      get innerHTML() {
        return this._text;
      },
    }),
  });

  return renderer.toString();
};

const sendWebNotification = async (
  relay: string,
  event: SignedEvent,
  endpoint: string,
  p256dh: string,
  auth: string,
) => {
  const subscription = {
    endpoint,
    keys: {
      auth,
      p256dh,
    },
  };

  const payload = JSON.stringify({
    title: "New activity",
    body: getNotificationBody(event),
    relays: [relay],
    event,
  });

  await webpush.sendNotification(subscription, payload);
};

const sendApnsNotification = async (
  relay: string,
  event: SignedEvent,
  bundleIdentifier: string,
  deviceToken: string,
) => {
  let notification = new apn.Notification({
    topic: bundleIdentifier,
    sound: "default",
    badge: 1,
    alert: {
      title: "New activity",
      body: getNotificationBody(event),
    },
    payload: {
      relays: JSON.stringify([relay]),
      event: JSON.stringify(event),
    },
  });

  const { failed } = await apnProvider.send(notification, deviceToken);

  if (failed.length > 0) {
    throw new Error(failed[0].response?.reason);
  }
};

const sendAndroidNotification = async (
  relay: string,
  event: SignedEvent,
  deviceToken: string,
) => {
  await fcm.messaging().send({
    token: deviceToken,
    notification: {
      title: "New activity",
      body: getNotificationBody(event),
    },
    data: {
      relays: JSON.stringify([relay]),
      event: JSON.stringify(event),
    },
    android: {
      priority: "high" as const,
    },
  });
};

export const app = new Hono();

const schema = z.object({
  relay: z.string(),
  config: z.string().array().array(),
  event: z.object({
    id: z.string(),
    pubkey: z.string(),
    content: z.string(),
    tags: z.string().array().array(),
    created_at: z.int(),
    kind: z.int(),
    sig: z.string(),
  }),
});

app.post("/notify", zValidator("json", schema), async (c) => {
  try {
    const { relay, event, config } = c.req.valid("json");

    if (!verifyEvent(event)) {
      throw new HTTPException(400, { message: "Invalid event" });
    }

    const vapid_endpoint = getTagValue("vapid_endpoint", config);
    const vapid_p256dh = getTagValue("vapid_p256dh", config);
    const vapid_auth = getTagValue("vapid_auth", config);
    const fcm_token = getTagValue("fcm_token", config);
    const ios_bundle_identifier = getTagValue("ios_bundle_identifier", config);
    const apns_token = getTagValue("apns_token", config);

    if (vapid_endpoint && vapid_p256dh && vapid_auth) {
      sendWebNotification(
        relay,
        event,
        vapid_endpoint,
        vapid_p256dh,
        vapid_auth,
      );
    }

    if (fcm_token) {
      sendAndroidNotification(relay, event, fcm_token);
    }

    if (ios_bundle_identifier && apns_token) {
      sendApnsNotification(relay, event, ios_bundle_identifier, apns_token);
    }
  } catch (error: any) {
    console.error(`Failed to send push notification:`, error);
    throw new HTTPException(500);
  }
});

const port = process.env.PORT || 3000;

serve({
  fetch: app.fetch,
  port: Number(port),
});

console.log("Running on port", port)
