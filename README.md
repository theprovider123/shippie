# Shippie

> Apps on your phone, without the App Store.

Shippie is the shipping system that turns code into launched, installed, used, iterated-on software — and gets it store-ready along the way.

## Repo layout

```
apps/
  web/                  # Next.js 16 control plane → Vercel
packages/
  sdk/                  # @shippie/sdk — same-origin client SDK
  db/                   # Drizzle schema + migrations
  session-crypto/       # SHA-256 / HMAC primitives shared by web + worker
  shared/               # Types, constants, shippie.json schema
services/
  worker/               # Cloudflare Worker — runtime plane (*.shippie.app)
infra/                  # Hetzner, Cloudflare, GitHub App, Stripe configs
docs/
  specs/                # v3 → v6 specification + patch chain (read-only history)
```

## Development

```bash
bun install
bun run dev
```

## The Three Ships

Every `app` project serves three distribution channels from one codebase:

1. **Ship to Web** — `{slug}.shippie.app` (always on)
2. **Ship to Phone** — PWA install on Android + iOS
3. **Ship to Stores** — Play Store + App Store (gated by Native Readiness Score ≥85)

## Specification

The full v6 master specification is in `docs/specs/shippie-implementation-plan-v6.md`.
The patch chain (v5.1 → v5.1.6) is preserved alongside it for audit traceability.
