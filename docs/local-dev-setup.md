# Local Dev Setup

Zero external accounts. Everything runs on your laptop.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| macOS | Any recent | — |
| [Homebrew](https://brew.sh) | Any | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| [Bun](https://bun.sh) | ≥ 1.3 | `curl -fsSL https://bun.sh/install \| bash` |
| Node | ≥ 20 | `brew install node@20` or use `nvm` |
| Postgres 16 | 16.x | `brew install postgresql@16` |

Windows / Linux: swap Homebrew for your package manager. The rest is the same.

## First-time setup

```bash
# 1. Clone and install
git clone <repo-url> shippie
cd shippie
bun install

# 2. Start Postgres
brew services start postgresql@16

# 3. Create the dev database
/opt/homebrew/opt/postgresql@16/bin/createdb shippie_dev

# 4. Create apps/web/.env.local
cat > apps/web/.env.local <<EOF
DATABASE_URL="postgres://$(whoami)@localhost:5432/shippie_dev"
AUTH_SECRET="$(openssl rand -hex 32)"
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="http://localhost:4100"
EOF

# 5. Apply migrations
cd packages/db && bun run db:push && cd ../..

# 6. Start the dev server
cd apps/web && bun run dev
```

Visit http://localhost:4100.

## Daily dev loop

```bash
# Postgres keeps running as a background service — no action needed
# If you rebooted and it's not up:
brew services start postgresql@16

# From repo root
cd apps/web && bun run dev
```

Visit http://localhost:4100. Sign in at `/auth/signin` — the magic link
prints to the terminal.

## Running tests

```bash
# Full test suite (PGlite in-memory + Web Crypto primitives)
cd packages/db && bun test
cd ../session-crypto && bun test
```

## Resetting the database

```bash
/opt/homebrew/opt/postgresql@16/bin/dropdb shippie_dev
/opt/homebrew/opt/postgresql@16/bin/createdb shippie_dev
cd packages/db && bun run db:push
```

## Port reference

| Port | Service |
|------|---------|
| 5432 | Postgres (Homebrew default) |
| 4100 | Next.js dev server (`shippie.app` control plane) |
| Future | `services/worker` wrangler dev — will use a different port |

## What's stubbed vs live

All external integrations are intentionally stubbed in dev:

| Service | Dev | Live |
|---------|-----|------|
| Database | Homebrew Postgres | Hetzner + PgBouncer + Cloudflare Tunnel |
| Email | Magic link prints to terminal | Resend (set `RESEND_API_KEY`) |
| Storage | — (not wired yet) | Cloudflare R2 |
| Build runner | — (not wired yet) | Vercel Sandbox |
| Functions runtime | — (not wired yet) | Cloudflare Workers for Platforms |
| GitHub integration | — (not wired yet) | GitHub App |
| Billing | — (not wired yet) | Stripe |
| OpenAI (auto-packaging) | — (not wired yet) | OpenAI API |
| Observability | — (not wired yet) | Sentry |

Each adapter lands in its own week of the v6 build plan. You don't need
any external accounts to run Shippie in dev until a feature specifically
calls for one.

## Troubleshooting

### `next dev` fails with `EADDRINUSE :4100`

Another process is on port 4100. Kill it or change the port:

```bash
lsof -iTCP:4100 -sTCP:LISTEN
kill <pid>
```

### `psql: connection refused`

Postgres isn't running:

```bash
brew services list | grep postgres
brew services start postgresql@16
```

### Migrations fail with `relation already exists`

The migrations ledger is out of sync with the DB. Reset:

```bash
/opt/homebrew/opt/postgresql@16/bin/dropdb shippie_dev
/opt/homebrew/opt/postgresql@16/bin/createdb shippie_dev
cd packages/db && bun run db:push
```

### Auth.js errors with `Configuration` / `AdapterError`

Usually means `.env.local` is missing or `AUTH_SECRET` is unset. Re-run the
setup cat command above.

### `@shippie/db` import not found after pulling changes

Rebuild the workspace package:

```bash
cd packages/db && bun run build
```

Or let Turbo do it for you (dev task depends on `^build`):

```bash
bun run dev  # from repo root; builds deps first
```
