# Local Dev Setup

Zero external accounts. Everything runs on your laptop.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Bun | >= 1.3 | `curl -fsSL https://bun.sh/install \| bash` |
| Node | >= 20 | `brew install node@20` or `nvm` |
| Wrangler | latest | bundled — `bun install` brings it in |

## First-time setup

```bash
git clone <repo-url> shippie && cd shippie
bun install

# Apply local D1 migrations (required before /apps loads)
cd apps/platform && bun run db:migrate:local && cd ../..

# Start the dev server
cd apps/platform && bunx wrangler dev --local
```

Visit http://localhost:4101.

Sign in at `/auth/signin` — the magic link prints to `/tmp/main-dev.log`:

```bash
tail -f /tmp/main-dev.log
```

To grant yourself admin in the local D1:

```bash
# Run the local admin-grant command from apps/platform
bun run db:admin:local
```

## Daily dev loop

```bash
cd apps/platform && bunx wrangler dev --local
tail -f /tmp/main-dev.log   # in a second pane for magic links
```

## Running tests

```bash
# Platform (vitest)
cd apps/platform && bun run test

# Type checking
cd apps/platform && bun run svelte-check

# Full health check from repo root
bun run health   # typecheck + test + build
```

## Port reference

| Port | Service |
|------|---------|
| 4101 | SvelteKit + Cloudflare platform proxy (wrangler dev --local) |
| 8787 | Wrangler preview when needed |

## What's stubbed vs live

| Service | Dev | Live |
|---------|-----|------|
| Database | Local D1 via wrangler | Cloudflare D1 |
| Email | Magic link -> `/tmp/main-dev.log` | Cloudflare Email binding |
| Storage | Local proxy binding | Cloudflare R2 |
| Build runner | Local zip/build flow | GitHub Actions |
| Runtime | Local Worker preview | Cloudflare Workers |
| Billing | Not wired | Stripe |
| AI (auto-packaging) | Not wired | OpenAI API |
| Observability | Not wired | Sentry |

## Troubleshooting

**`/apps` returns 500 on fresh checkout** — migrations haven't run yet:
```bash
cd apps/platform && bun run db:migrate:local
```

**Port 4101 already in use:**
```bash
lsof -iTCP:4101 -sTCP:LISTEN
kill <pid>
```

**Magic link never appears** — check the log file, not the terminal:
```bash
tail -f /tmp/main-dev.log
```

**`@shippie/db` import not found after pulling** — rebuild workspace packages:
```bash
bun run dev   # from repo root; Turbo builds deps first
```

**Migrations fail with `relation already exists`** — reset local D1:
```bash
cd apps/platform && bun run db:migrate:local --reset
```
