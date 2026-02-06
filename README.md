# Nostr Push Server

This is a minimal push notification server intended to receive nostr events as described in [this NIP](https://github.com/nostr-protocol/nips/pull/2194).

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

