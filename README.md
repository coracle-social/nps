# Nostr Push Server

This is a minimal push notification server intended to receive nostr events as described in [this NIP](https://github.com/nostr-protocol/nips/pull/2194).

## Notifications

Relays post to `/notify/:id` with an `id` and a `relay`, and may include the event itself as `event`. It reaches the device as a JSON string under the same name, so a client can render the notification without fetching the event back. An event large enough to push the payload past the 4KB FCM and APNs limit is dropped, and the device gets the `id` and `relay` alone.

## Configuration

- `APN_TOPIC` - the bundle identifier for the app this push server is serving
- `APN_KEY_ID` - APNs key ID
- `APN_KEY` - APNs private key certificate
- `APN_PRODUCTION` - `false` or `true` (false if testing in development)
- `APN_TEAM_ID` - APNs team ID
- `BASE_URL` - The URL this push server will be served on
- `CORS_ORIGIN` - Which domains can make CORS requests (defaults to `*`)
- `FCM_KEY` - FCM key JSON
- `PORT` - the port to run the server on (defaults to `3000`)
- `DATA_DIR` - directory to store the sqlite database in (defaults to `.`)
- `VAPID_PRIVATE_KEY` - VAPID private key
- `VAPID_PUBLIC_KEY` - VAPID public key
- `VAPID_SUBJECT` - VAPID subject

