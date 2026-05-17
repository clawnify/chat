# clawnify/chat

A friendlier chat UI for [OpenClaw](https://openclaw.ai) gateways.

OpenClaw ships a built-in Control UI at `http://<gateway>:18789`. This is a
separate, opinionated client that talks the same WebSocket protocol but trades
breadth for polish — it focuses on the daily-driver chat surface and leaves
gateway administration to the upstream Control UI.

> **Status: v0 scaffold.** Connection, settings, basic chat send/receive work.
> Tool-event cards, approval UI, action groups, and richer history rendering
> are queued up — see [Roadmap](#roadmap) below.

## Quick start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` and fill in the settings:

- **Gateway URL** — `ws://127.0.0.1:18789` for a local gateway, or
  `wss://magicdns.example.ts.net` over Tailscale Serve.
- **Gateway token** — the shared secret from your gateway's
  `~/.openclaw/openclaw.json` under `gateway.auth.token`.

You can also pre-fill via the URL (matches upstream Control UI's dev mode):

```
http://localhost:5173/?gatewayUrl=ws://127.0.0.1:18789#token=<your-token>
```

- `gatewayUrl` is persisted to `localStorage` after first load.
- `token` lives in the URL **fragment** (never sent to the server) and is
  kept in memory only unless you tick "Remember token in this browser".

## Gateway-side configuration

For non-loopback connections, your gateway must whitelist this app's origin.
Edit `~/.openclaw/openclaw.json`:

```json5
{
  gateway: {
    controlUi: {
      allowedOrigins: [
        "http://localhost:5173",
        "https://chat.example.com"
      ]
    }
  }
}
```

Loopback (`127.0.0.1`, `localhost`) is allowed automatically.

## First-time pairing

The first browser to connect to a gateway needs a one-time pairing approval.
You will see `disconnected (1008): pairing required`. On the gateway host:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

Once approved, the device is remembered until you revoke it.

## Deployment

The build output (`pnpm build` → `dist/`) is plain static files. Drop them
anywhere — Cloudflare Pages, Netlify, Vercel, an S3 bucket, a Caddy server on
your Mac mini. The gateway URL and token are configured at runtime, not at
build time.

## Roadmap

- [x] **v0**: connect handshake, settings, basic `chat.history` / `chat.send`
      / streaming `chat` events / abort
- [ ] **v0.1**: tool-event cards (`tool-events` cap), action groups, action
      icon/label lookup
- [ ] **v0.2**: approval cards (`exec.approval.*`, `plugin.approval.*`)
- [ ] **v0.3**: rich history parser (compaction events, retrying phase,
      fallback toasts, abort partials)
- [ ] **v0.4**: session/model picker, slash commands

## Architecture

- `src/lib/gateway-ws.ts` — disposable WebSocket client for the gateway
  protocol (v4). Connect handshake with Ed25519 device identity.
- `src/lib/device-identity.ts` — Ed25519 keypair generation + challenge
  signing. Keys persist in `localStorage`.
- `src/lib/config.ts` — bootstraps the gateway URL and token from URL
  fragment / query param / `localStorage`.
- `src/components/Settings.tsx` — form for gateway URL + token.
- `src/components/Chat.tsx` — v0 chat surface.

## Relation to OpenClaw

This is an independent client. It speaks the standard Gateway WebSocket
protocol documented at [openclaw.ai/web/control-ui](https://openclaw.ai/web/control-ui).
No fork, no patches — point it at your gateway and it works.

## License

MIT. See [LICENSE](./LICENSE).
