# @shippie/platform

SvelteKit on Cloudflare Workers — the v2 platform app. Replaces `apps/web` (Next.js on Vercel) at cutover (Phase 8).

## Status

**Phase 1 — shell.** This package is the empty SvelteKit + adapter-cloudflare scaffold. Bindings (D1, R2, KV, DO) are declared in `wrangler.toml` but the IDs need filling in by you.

See:
- `docs/superpowers/plans/2026-04-25-cf-sveltekit-refactor.md` — full plan + addendum
- `docs/superpowers/refactor/preflight.md` — Phase 0 checklist (this is what's pending you)
- `docs/superpowers/refactor/route-inventory.md` — every route to port + status

## Bring-up steps (you)

```bash
cd apps/platform
bun install                               # installs SvelteKit + Lucia + Arctic + drizzle stack

# Provision Cloudflare resources (one-time)
bunx wrangler d1 create shippie-platform-d1
# → paste the `database_id` into wrangler.toml line ~22

bunx wrangler r2 bucket create shippie-apps-prod
bunx wrangler r2 bucket create shippie-assets

bunx wrangler kv namespace create shippie-platform-cache
# → paste the `id` into wrangler.toml line ~40

# Apply the initial migration
bunx wrangler d1 migrations apply shippie-platform-d1 --remote

# Deploy
bunx wrangler deploy
# → outputs the workers.dev hostname; add `next.shippie.app` CNAME to it in CF DNS
```

## Local dev

```bash
bun run dev
# Vite serves on http://localhost:4101 with platform-proxy → resolves real CF bindings
```

The homepage is a smoke test: it queries every binding (D1 SELECT 1, R2 head, KV get, DO presence) and renders the result. Green output everywhere = Phase 1 complete.

## What's NOT here yet

Per the phase plan:
- Phase 2: full schema mirror + dual-write
- Phase 3: Lucia auth (GitHub + Google + magic-link + CLI device flow)
- Phase 4: marketplace + maker subdomain serving
- Phase 5: deploy + dashboard
- Phase 6: wrapper rewriter port + SignalRoom DO + cf-storage retirement
- Phase 7: cron + GH Actions + admin
- Phase 8: cutover

Each phase has acceptance criteria (integration tests) listed in the main plan's addendum.
