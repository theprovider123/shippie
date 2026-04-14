# Dev Database

> **Status:** Session 2 landed schema, migrations, and Auth.js wiring. PGlite works
> for tests (13 passing) but the Next.js dev server currently crashes PGlite's WASM
> instance during Turbopack hot-reloads. Session 3 picks the persistent dev backend.

## What works today

**Tests against PGlite** — `packages/db` tests run against an in-memory PGlite
instance and cover:

- Migration 0001 + 0002 applying cleanly
- Migration runner idempotency and drift detection
- Reserved slugs seeded correctly
- `sync_app_latest_deploy` trigger for **all cases** from v6 §18.3 / Fix v5.1.5 Q:
  - First insert populates `apps.latest_*`
  - Same-row `needs_secrets → building → success` transitions propagate
  - Newer version supersedes older
  - Failed status reflected in `latest_deploy_status`
- `deploys.status` CHECK constraint rejects invalid values
- `reserved_slugs` PK + `apps.slug` uniqueness enforced
- FTS `tsvector` populates and matches queries
- Auth.js tables accept adapter-style inserts
- `users` table accepts inserts without `username` (Auth.js createUser compatibility)

Run:

```bash
cd packages/db
bun test src/migrate.test.ts
```

## What does NOT work: PGlite + Next.js dev server

`@electric-sql/pglite` runs Postgres in WebAssembly. In a long-running Next.js dev
server:

1. Next.js's Turbopack reloads route modules (`/api/auth/[...nextauth]/route.ts`)
   on code changes and during static path analysis.
2. Each reload re-evaluates the module, and despite `globalThis.__shippieDbHandle`
   caching, PGlite's internal WASM state ends up in a bad condition (file-backed
   dataDir lock contention, WASM runtime state that survives but shouldn't).
3. The result is `RuntimeError: Aborted()` from `callMain` inside PGlite on the
   OAuth callback request — even though the earlier POST request (which creates
   the user + verification token) succeeds.

This is a known friction point for stateful WASM in Next.js dev. It is **not**
a problem in production where we use real Postgres via postgres-js → PgBouncer
→ Hetzner.

## Options for Session 3

| Option | Setup | Matches prod | Dev persistence |
|--------|-------|-------------|-----------------|
| **embedded-postgres npm** | `bun add @embedded-postgres/...` — spawns a real Postgres child process | ✅ identical driver (postgres-js) | ✅ file-backed |
| **Homebrew Postgres** | `brew install postgresql@16 && brew services start postgresql@16` | ✅ identical driver | ✅ file-backed |
| **Docker Postgres** | Install Docker Desktop + run `docker compose up -d` | ✅ closest to Hetzner setup | ✅ file-backed |
| **PGlite in-memory** | `DATABASE_URL=pglite://memory` — change nothing else | ❌ driver differs | ❌ wiped on restart |

All four keep `packages/db` + its tests running against PGlite unchanged — only
the Next.js dev server switches drivers via `DATABASE_URL`.

## Recommendation

**embedded-postgres** is the zero-user-install winner. It ships a real Postgres
binary as an npm package, spawns it as a child process on first access, and
exposes a standard TCP connection. Identical driver path to production.

Alternatively, if the user already has Homebrew, `brew install postgresql@16`
takes 60 seconds and you're done.

Either way, `.env.local` becomes `DATABASE_URL=postgres://localhost:5432/shippie_dev`
and the exact same code runs in dev, CI, and production.

## Auth.js wiring (already in place)

Everything from Session 2 is ready:

- `apps/web/lib/db.ts` — `globalThis`-cached Drizzle client factory
- `apps/web/lib/auth/index.ts` — Auth.js v5 config with Drizzle adapter, lazy
  adapter resolution, database sessions, dev email provider
- `apps/web/lib/auth/dev-email-provider.ts` — Nodemailer provider that
  `console.log`s the magic link instead of sending email
- `apps/web/app/api/auth/[...nextauth]/route.ts` — all Auth.js endpoints
  (`force-dynamic`, `nodejs` runtime, `no-store` cache)
- `apps/web/app/auth/signin/page.tsx` — server-action magic link form
- `apps/web/app/auth/verify-request/page.tsx` — "check your terminal" UX
- `apps/web/app/auth/error/page.tsx` — generic error surface
- `apps/web/app/dashboard/page.tsx` — protected page with `auth()` redirect
- `packages/db/migrations/0002_auth_tables.sql` — accounts, sessions,
  verification_tokens with FKs to `users`

The moment the dev database swap is made in Session 3, the smoke test
(sign in → terminal magic link → paste → dashboard shows email) will pass
without any code changes.
