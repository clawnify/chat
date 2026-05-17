# Contributing

Thanks for your interest! This project is open to contributions from
anyone — no contributor agreement, no gatekeeping list.

## Filing issues

Please include:

- What you tried (`npx @clawnify/agent-control-ui` vs running from source).
- Your OpenClaw gateway version (`openclaw --version`).
- Browser + OS.
- Any error in the dev console.

If you're reporting a UX nit, a screenshot or short screen recording
helps a lot.

## Pull requests

1. Fork the repo.
2. Create a branch.
3. Commit your changes — keep them focused; one concern per PR.
4. Open a PR against `main`. Describe the change and link any
   related issue.

### Local dev

```bash
pnpm install
pnpm dev      # Vite dev server at :5173
pnpm typecheck
pnpm build    # production bundle in dist/
```

### Code style

- TypeScript strict.
- Tailwind v4 + shadcn primitives (the unstyled Radix-based components
  live in `src/components/ui/`). Add new primitives with
  `pnpx shadcn@latest add <name>` and move the generated file from the
  literal `@/` path to `src/components/ui/`.
- Keep dependencies minimal — every new package should justify its
  bundle cost.

### Protocol fidelity

This is an independent client for the upstream OpenClaw Gateway
WebSocket protocol. When in doubt about a gateway RPC / event shape,
ground your change in the canonical source at
[openclaw/openclaw](https://github.com/openclaw/openclaw) — typically
`src/tui/gateway-chat.ts` for RPCs and
`ui/src/ui/controllers/chat.ts` for event handling. The point is to
stay compatible with any standard OpenClaw gateway, not to invent a
parallel protocol.

## License

By contributing, you agree your code is released under the MIT license,
matching the rest of the repo.
