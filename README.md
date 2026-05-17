# If OpenClaw hadn't been built by engineers, it would look like this

A friendlier chat UI for [OpenClaw](https://openclaw.ai) gateways.

<img width="1207" height="992" alt="Image" src="https://github.com/user-attachments/assets/b8c5d52f-3977-4a4c-80ea-fb3c74e76cfd" />

OpenClaw ships a built-in Control UI at `http://<gateway>:18789`. This is a
separate, opinionated client that talks the same WebSocket protocol but trades
breadth for polish — it focuses on the daily-driver chat surface and leaves
gateway administration to the upstream Control UI.

> **Status: v0 scaffold.** Connection, settings, basic chat send/receive work.
> Tool-event cards, approval UI, action groups, and richer history rendering
> are queued up — see [Roadmap](#roadmap) below.

## Quick start

```bash
npx @clawnify/agent-control-ui
```

That's it. The command starts a local static server on
`http://127.0.0.1:5174/`. Open it in your browser, fill in the gateway URL +
token, and you're connected.

<img width="577" alt="Auto-detected local OpenClaw gateway" src="https://github.com/user-attachments/assets/92550201-2584-4bb8-b231-134d5743e685" />

When run locally, the UI reads `~/.openclaw/openclaw.json` over a
loopback-only HTTP endpoint and offers a one-click connect. The token
stays in memory unless you explicitly persist it.

If no local gateway is found (or you want to point at a remote one),
the Connection dialog accepts manual settings:

<img width="577" alt="Manual connection settings" src="https://github.com/user-attachments/assets/87c76d50-982f-4c4e-887d-6f05bee22335" />

- **Gateway URL** — `ws://127.0.0.1:18789` for a local gateway, or
  `wss://magicdns.example.ts.net` over Tailscale Serve.
- **Gateway token** — the shared secret from your gateway's
  `~/.openclaw/openclaw.json` under `gateway.auth.token`.

You can pre-fill via the URL:

```
http://127.0.0.1:5174/?gatewayUrl=ws://127.0.0.1:18789#token=<your-token>
```

- `gatewayUrl` is persisted to `localStorage` after first load.
- `token` lives in the URL **fragment** (never sent to any server) and is
  kept in memory only unless you tick "Remember token in this browser".

### Or from source

```bash
pnpm install
pnpm dev
```

Opens a Vite dev server at `http://localhost:5173`.

## Run as a service

Auto-start `@clawnify/agent-control-ui` on boot alongside the OpenClaw gateway. Unit
templates ship with the repo:

- **Linux** (systemd) — see [packaging/systemd/](packaging/systemd/agent-control-ui.service)
- **macOS / Mac mini** (launchd) — see [packaging/launchd/](packaging/launchd/com.clawnify.agent-control-ui.plist)

Setup instructions: [packaging/README.md](packaging/README.md).

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
