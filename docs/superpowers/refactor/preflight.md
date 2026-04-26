# Phase 0 — Pre-flight checklist

Generated 2026-04-25 as part of accepting the SvelteKit refactor plan. This is the deliverable that ends Phase 0 (Day 2 of week 0).

---

## Schema audit (done)

**19 migrations** to consolidate into D1-flavoured equivalents. Postgres-specific features in current schema:

| Feature | Count | D1 strategy |
|---|---|---|
| `jsonb()` columns | 18 | Replace with `text('...').$type<T>()` + Drizzle helper that auto JSON.stringify/parse on read/write. Existing query call sites already access these as objects, so the helper wraps the conversion. |
| Postgres enums (`pgEnum()`) | 0 | None declared — current schema uses `text()` with TypeScript unions. **No conversion needed.** New schema can ADD CHECK constraints for safety. |
| UUID columns | most PKs | SQLite has no UUID type. Default to `text('id').$defaultFn(() => crypto.randomUUID())`. Tests need to seed with consistent IDs. |
| `now()` defaults | many | SQLite equivalent is `datetime('now')`. Drizzle: `.default(sql`datetime('now')`)`. |
| Partitioned table (`app_events_<YYYY_MM>`) | 1 | D1 has no partitioning. Replace `DROP PARTITION` with `DELETE FROM analytics_events WHERE created_at < datetime('now', '-60 days')`. |
| Triggers (FTS sync) | depends | SQLite native FTS5 + INSERT/UPDATE/DELETE triggers (the spec already shows these). |
| Cross-table transactions | a few | D1 supports `db.batch([...])` for atomic multi-statement. Use `db.batch` where Postgres uses `BEGIN/COMMIT`. |
| `RETURNING *` | many | D1 supports `RETURNING` natively as of 2024. Drizzle's `.returning({id})` works. |
| ON CONFLICT DO UPDATE | a few | D1 supports `ON CONFLICT(...) DO UPDATE`. Drizzle helper `.onConflictDoUpdate()` works. |

**No migration blockers found in the schema.** The `text()`-with-comment-union pattern actually simplifies the port — no enum-type rewrites needed.

## D1 budget check

D1 hard limits (paid plan, current as of 2026):
- 10 GB per database
- 100k row limit per query result
- 1 KB per row default (configurable up to 4 KB)

Current Neon row counts (estimates from staging — production will be similar order of magnitude):

| Table | Rough size | D1 fit |
|---|---|---|
| `users` | ~hundreds | ✅ |
| `apps` | ~tens | ✅ |
| `deploys` | ~hundreds | ✅ |
| `app_events` (spine, partitioned) | ~tens of thousands so far | ✅ within budget; retention cron drops old months |
| `usage_daily` (rollups) | ~hundreds | ✅ |
| `app_ratings`, `comments`, `feature_requests` | ~tens-hundreds | ✅ |
| `audit_log` | ~thousands | ✅ |
| `app_invites`, `app_access` | ~tens | ✅ |

**Conclusion: comfortable fit in D1 free tier (5 GB) for the foreseeable future.** The retention cron handles long-tail growth on `analytics_events`. If row volume on `app_events` becomes pathological, partition by writing to a second D1 database or to KV-namespace-per-month buckets.

---

## Resource provisioning checklist (user actions)

These commands must be run by the user in their terminal — they create billable Cloudflare resources tied to the user's account. Cannot be automated.

### A. Create new Cloudflare resources for the canary

```bash
# D1 database (separate from any existing — green-field)
bunx wrangler d1 create shippie-platform-d1
# Capture the database_id from output and paste into apps/platform/wrangler.toml

# R2 buckets (don't reuse the existing shippie-apps until cutover — keeps the prod-Vercel pipeline working alongside canary)
bunx wrangler r2 bucket create shippie-apps-prod
bunx wrangler r2 bucket create shippie-assets

# KV namespace for cache + sessions
bunx wrangler kv namespace create shippie-platform-cache
# Capture the id from output, paste into wrangler.toml

# Deploy the empty SvelteKit shell to Workers (Phase 1)
cd apps/platform
bunx wrangler deploy
# Capture the workers.dev hostname output, e.g. shippie-platform.<acct>.workers.dev
```

**Estimated cost:** $0/mo while only the canary runs (Workers + D1 + R2 free tiers cover it).

### B. GitHub OAuth client v2

The Lucia auth flow needs a fresh OAuth client because the redirect URIs change. Best to keep the existing NextAuth client untouched until cutover.

1. Visit https://github.com/settings/applications/new (or your GitHub org's app settings).
2. Application name: `Shippie (canary)`
3. Homepage URL: `https://next.shippie.app`
4. Authorization callback URL: `https://next.shippie.app/auth/callback/github`
5. Generate a client secret. Keep both Client ID and Client Secret.

For canary, only `next.shippie.app` callback is needed. The cutover step (Phase 7/8) will switch to a single OAuth client with TWO redirect URIs (`next.shippie.app` + `shippie.app`) so the canary OAuth keeps working during the transition.

### C. DNS setup for canary

In your Cloudflare dashboard for `shippie.app`:

1. Go to DNS → Records → Add record
2. Type: `CNAME`
3. Name: `next`
4. Target: `shippie-platform.<your-cf-account>.workers.dev` (from step A's deploy output)
5. Proxy status: **Proxied** (orange cloud)
6. TTL: Auto

Verify: `dig next.shippie.app` should resolve, and `curl -I https://next.shippie.app` should return 200 (or whatever the empty shell serves).

### D. Resend account for magic-link emails (already exists from prior session — reuse)

Confirm `RESEND_API_KEY` is in your password manager. Same key used for the canary app's magic-link emails. Don't need a separate key.

In Resend dashboard:
1. Add `next.shippie.app` as an authorized sending domain (DNS records will be provided).
2. Or, for the canary phase, use `onboarding@resend.dev` as the From address — fine for a test environment.

### E. Vercel cron preserved during transition

**Don't disable Vercel crons until Phase 7.** The crons keep firing on the Vercel platform throughout the canary phase. After Phase 7 completes (when `scheduled` handlers are running on Cloudflare), the Vercel crons get disabled in `vercel.json` (set the `crons` array to `[]`).

---

## What I'll do next (Phase 1 prep, autonomous)

Now that Phase 0 inventory + preflight are done, I can do the following autonomously without needing your CF or GitHub credentials:

1. Scaffold `apps/platform/` SvelteKit project with the file layout from the main plan (Phase 1).
2. Write `wrangler.toml` and `svelte.config.js` with placeholder IDs (you'll fill them in after step A above).
3. Write `app.d.ts` with `App.Platform` typed bindings.
4. Write the empty `hooks.server.ts` skeleton with hostname routing.
5. Write the initial Drizzle schema for `users` + `sessions` (Lucia-compatible).
6. Write `drizzle/0001_init.sql` with the schema.
7. Stub the homepage `+page.svelte` so `wrangler deploy` returns something.

Once steps A-D above are done by you and you paste me the IDs, I unblock Phase 1's `wrangler deploy`. Phase 2+ then has a real canary to deploy against.

---

## Out-of-scope reminders for Phase 0

These are NOT being done in Phase 0 per the main plan — flagging so they're not assumed done:

- **No data migration yet.** Phase 2 does the dual-write + mirror.
- **No auth migration yet.** Phase 3 ports NextAuth → Lucia.
- **No route ports yet.** Phase 4+ does this in priority order.
- **Existing `apps/web/` keeps running on Vercel.** Don't decommission anything.
- **`packages/cf-storage/` not deleted yet.** Phase 6 retires it after the platform Worker uses native bindings exclusively.

Cutover is week 8. Until then, Vercel is prod, Cloudflare is canary, both operate in parallel.
