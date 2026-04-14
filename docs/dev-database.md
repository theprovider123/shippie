# Dev Database

> **Status:** Homebrew Postgres 16 wired in Session 3. End-to-end sign-in
> flow verified working (sign-in → magic link → callback → dashboard →
> sign-out → session row deleted).

## TL;DR for a fresh machine

```bash
# 1. Install Postgres 16 via Homebrew (~1 minute)
brew install postgresql@16

# 2. Start it as a background service
brew services start postgresql@16

# 3. Create the local dev database
/opt/homebrew/opt/postgresql@16/bin/createdb shippie_dev

# 4. Point Shippie at it
echo "DATABASE_URL=\"postgres://$(whoami)@localhost:5432/shippie_dev\"" > apps/web/.env.local
echo "AUTH_SECRET=\"$(openssl rand -hex 32)\"" >> apps/web/.env.local
echo "AUTH_TRUST_HOST=\"true\"" >> apps/web/.env.local
echo "NEXTAUTH_URL=\"http://localhost:4100\"" >> apps/web/.env.local

# 5. Apply migrations
cd packages/db && bun run db:push

# 6. Start dev server
cd ../../apps/web && bun run dev
```

Visit http://localhost:4100/auth/signin, enter any email, copy the magic link
from the terminal, paste it in the browser — you're signed in.

## Which database driver does what

Shippie's `packages/db` has a polymorphic client factory. The `DATABASE_URL`
prefix picks the driver:

| URL prefix | Driver | Used for |
|------------|--------|----------|
| `postgres://...` | `postgres-js` → real Postgres | Dev server, CI, production (Hetzner) |
| `pglite://./path` | PGlite (file-backed) | Reserved — not currently used (see notes) |
| `pglite://memory` | PGlite (in-memory) | `packages/db` unit tests only |

The test suite in `packages/db/src/migrate.test.ts` runs against
`pglite://memory` for speed and isolation. Everything else uses real Postgres.

## Why not PGlite for the dev server

PGlite runs Postgres in WebAssembly. Next.js's Turbopack dev server reloads
route modules (`/api/auth/[...nextauth]/route.ts`) on code changes and during
static path analysis. Each reload tries to boot a fresh PGlite WASM instance,
and despite `globalThis` caching the WASM state degrades across reloads until
PGlite aborts with `RuntimeError: Aborted()` on an OAuth callback.

This is a known friction point for stateful WASM under Next.js dev — not a
code bug. The exact same Auth.js + Drizzle code works perfectly against a
real Postgres because the DB lives in a separate process and the driver
(`postgres-js`) is stateless at the Node level.

We keep PGlite for the test suite (where each `createDb` gets its own
ephemeral instance in a clean Node process) and use Homebrew Postgres for
the dev server.

## Production

Production `DATABASE_URL` points at a Hetzner-hosted Postgres 16 instance
behind PgBouncer via a Cloudflare Tunnel:

```
postgres://shippie:<password>@db.internal.shippie:6432/shippie_prod
```

PgBouncer runs in transaction mode — `postgres-js` is already configured
for that with `prepare: false` in `packages/db/src/client.ts`.

Spec v6 §2.2.

## Verified flows (Session 3)

End-to-end smoke test against `postgres://devante@localhost:5432/shippie_dev`:

```
GET  /api/auth/csrf                   → 200   (CSRF token issued)
POST /api/auth/signin/nodemailer      → 302   (user + verification_token written)
                                              (magic link printed to `bun run dev` terminal)
GET  /api/auth/callback/nodemailer?token=… → 302 (session row created, cookie set)
GET  /dashboard                        → 200   (server component renders signed-in email)
GET  /dashboard                        → 200   (29ms — session persists across requests)
GET  /api/auth/csrf                    → 200   (fresh CSRF for signout)
POST /api/auth/signout                 → 302   (session row deleted)
GET  /dashboard                        → 307 → /auth/signin  (middleware redirect)
GET  /health                           → 200
```

Postgres state after cycle:

```sql
select count(*) from users where email='smoke@test.local';    --> 1
select count(*) from sessions where expires > now();           --> 0 after signout
select count(*) from reserved_slugs;                           --> 47 (seeded)
select tgname from pg_trigger where not tgisinternal;          --> 5
-- users/orgs/apps/app_permissions/deploys → set_updated_at
-- deploys                                 → sync_app_latest_deploy
```

## Resetting local dev state

```bash
# Drop and recreate the database (fast, loses all data)
/opt/homebrew/opt/postgresql@16/bin/dropdb shippie_dev
/opt/homebrew/opt/postgresql@16/bin/createdb shippie_dev
cd packages/db && bun run db:push

# Or just stop/start the service
brew services restart postgresql@16
```

## Stopping Postgres

```bash
brew services stop postgresql@16
```

## Alternate: if you don't want Homebrew

`embedded-postgres` npm package spawns a real Postgres child process from
Node. Install it as a dev dep, let the Drizzle client factory detect it via
a `DATABASE_URL=postgres-embedded://...` prefix, and you get the same
driver path without Homebrew. Not wired today — happy to add if needed.
