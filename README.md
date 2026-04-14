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
# One-time: install Postgres and set up the dev DB
brew install postgresql@16
brew services start postgresql@16
/opt/homebrew/opt/postgresql@16/bin/createdb shippie_dev

cat > apps/web/.env.local <<EOF
DATABASE_URL="postgres://$(whoami)@localhost:5432/shippie_dev"
AUTH_SECRET="$(openssl rand -hex 32)"
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="http://localhost:4100"
EOF

# Install deps + apply migrations + start dev server
bun install
cd packages/db && bun run db:push && cd ../..
cd apps/web && bun run dev
```

Visit http://localhost:4100. Sign in at `/auth/signin` — the magic link
prints to the `bun run dev` terminal (no SMTP needed for dev).

See [`docs/local-dev-setup.md`](docs/local-dev-setup.md) for full details.

## The Three Ships

Every `app` project serves three distribution channels from one codebase:

1. **Ship to Web** — `{slug}.shippie.app` (always on)
2. **Ship to Phone** — PWA install on Android + iOS
3. **Ship to Stores** — Play Store + App Store (gated by Native Readiness Score ≥85)

## Specification

The full v6 master specification is in `docs/specs/shippie-implementation-plan-v6.md`.
The patch chain (v5.1 → v5.1.6) is preserved alongside it for audit traceability.
