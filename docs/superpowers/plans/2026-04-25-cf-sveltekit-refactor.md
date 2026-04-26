# Architecture Refactor — Cloudflare + SvelteKit + D1

**Source spec:** the addendum titled "Shippie — Architecture Refactor: Full Cloudflare + SvelteKit" (2026-04-25 evening). This plan is the executable cut, with bugs flagged + scope corrected.

**Headline:** the destination is right (one vendor, native bindings, simpler architecture). The migration shape in the spec is wrong (timeline ×4, big-bang cutover, several false claims). This plan keeps the destination, fixes the migration.

---

## Spec review — what's solid, what's wrong

### Solid (keep these decisions)

| Decision | Why it's right |
|---|---|
| One Worker for `shippie.app` + `*.shippie.app` | Removes proxy hop; HTMLRewriter native to runtime |
| D1 native binding from server routes | Sub-ms internal latency; replaces Neon-over-HTTPS-from-Vercel |
| R2 native binding | Free egress, S3-compatible; replaces multi-cloud storage shuttle |
| Lucia + Arctic for auth | SvelteKit-native, D1 adapter exists, lighter than NextAuth |
| GitHub Actions for clone-and-build | Free, isolated, disposable. Right call for source-from-repo deploys |
| Durable Objects in same Worker | One service, no cross-binding HMAC dance |
| FTS5 for search | Right SQLite primitive; replaces tsvector |
| Cloudflare adapter for SvelteKit | First-class, not compat layer |

### Spec bugs that need correcting before execution

**B1. "Phase 2: 3 days for core routes" is off by an order of magnitude.** The current platform app is **49 API routes, 24 pages, 1,644 lines of Drizzle schema across 29 files, 19 migrations.** Realistic: **3–4 weeks for the route port alone**, not 3 days.

**B2. "All packages in `packages/*` work without modification" is false in two places.**
- `packages/cf-storage/` (CfKv + CfR2 over HTTP) becomes **obsolete the moment we switch to native bindings.** Should be retired, not preserved. Spec misses this win.
- `packages/db/` survives as a directory but its **entire schema is rewritten** (Postgres → SQLite; types change; migrations regenerate).

**B3. "Migrate Postgres → D1" hand-waves the data migration.** Real work involved:
- Many JSONB columns become TEXT + json_extract (autopackagingReport, app_profile, enhance_config, shippie_json, etc.)
- All Postgres enums become TEXT + CHECK constraints (visibility_scope, source_kind, source_type, status, category, app_type, etc.)
- All UUID columns become TEXT (with hex-encoded blob defaults)
- D1 has 10GB hard limit per database (current Neon size is small enough today, but worth budgeting)
- Existing data needs export → transform → bulk import. **This is a downtime window or read-mirror window** — not a flag-flip.
- D1 transaction semantics differ from Postgres; some current logic uses cross-table transactions that need re-examination.

**B4. "Lucia replaces NextAuth"** glosses over the fact that **every existing session breaks at cutover.** All users get logged out the moment we switch. Magic-link via Resend (currently a NextAuth provider) becomes custom Lucia code. The dev-email-provider that prints links to console needs a Lucia equivalent. Plan for this re-issuance.

**B5. "GitHub Actions for builds" breaks the under-60-second deploy claim.** GitHub Actions runners take 30s–2 minutes to start cold. Honest deploy times via this path: **2–5 minutes**. The fast-path for "upload a zip" should remain direct (R2 upload, no GH Actions) — that one CAN hit 60s. GH Actions is for the "connect a GitHub repo, we clone and build" flow.

**B6. New DO migration `tag = "v1" new_classes = ["SignalRoom", "SyncRelay"]`** conflicts with the existing wrangler.toml (this morning's work) which already defines `SignalRoom` as v1. The new platform Worker has a **different name** (`shippie-platform` vs `shippie-worker`), so DO namespaces are different — but cutover means the OLD `SignalRoom` instances inside the OLD worker disappear when that worker is deleted. Active rooms drop. Acceptable for v0 (rooms are ephemeral) but should be called out.

**B7. The spec calls for `apps/ai-engine/` as NEW** but we already shipped `apps/shippie-ai/` in this morning's post-cloud build. Same product, different folder name. **Reuse `apps/shippie-ai/`.** Don't fork.

**B8. The wrapper rewriter is "in `hooks.server.ts`"** in the spec. Reality: the existing `services/worker/src/rewriter.ts` already does HTMLRewriter injection with full handling for streaming responses, content-encoding, redirects, proxy mode (URL wrap), CSP headers, cookie rewriting. **Don't rewrite — port the file as-is** into the SvelteKit Worker. It's already CF Worker-compatible code.

**B9. Big-bang cutover ("Phase 6: Verify + cut over") is risky.** 170 commits of recent work, real DB data, real users (you on yourself). Big-bang means one bad bug = full rollback. Better: **canary deploy to `next.shippie.app`** in parallel with `shippie.app`, mirror data via dual-write, cut DNS only when canary passes the same Lighthouse / functional checks for a week.

**B10. Vercel Cron disappears.** Several existing endpoints (`api/internal/cron-*`) rely on Vercel's automatic `CRON_SECRET` injection. Cloudflare equivalent is `[triggers]` in wrangler.toml + `scheduled` event handler. **Different code path; needs porting.**

**B11. `wrangler.toml` `[build]` block** is for old Pages-based deployments. Modern path is `wrangler deploy` of a Worker with Static Assets — no `[build]` block, build runs in CI before deploy. Update.

**B12. Adapter choice.** Spec uses `@sveltejs/adapter-cloudflare-workers` (deprecated). Current is **`@sveltejs/adapter-cloudflare`** which targets Workers + Static Assets in one. Use that.

---

## What this plan does NOT change

- All of `packages/sdk/`, `packages/proximity/`, `packages/local-*`, `packages/access/`, `packages/session-crypto/`, `packages/pwa-injector/`, `packages/cli/`, `packages/mcp-server/`, `packages/shared/` — framework-agnostic, untouched.
- The three showcase apps (`apps/showcase-{recipe,whiteboard,journal}/`) — Vite-built, deployed via the same `/api/deploy` zip pipeline. The pipeline endpoint URL stays `https://shippie.app/api/v1/deploy` after the rewrite — the contract holds.
- `apps/shippie-ai/` — already a separate static deploy, no Next.js, untouched.
- The signed-request HMAC contract between platform and Worker proxy survives because they merge into one Worker — but `WORKER_PLATFORM_SECRET` is no longer needed (no boundary to authenticate).
- All client-side wrapper code in `packages/sdk/src/wrapper/` (observe runtime, your-data panel, group moderation panel, etc.) — runs in browsers, doesn't care what serves it.

---

## What this plan retires

- `apps/web/` — replaced by `apps/platform/` (SvelteKit). Migrated, not deleted, until cutover passes.
- `services/worker/` — merged into the SvelteKit Worker. The router files port as `src/lib/server/wrapper/` modules.
- `packages/cf-storage/` — **retired.** CfKv + CfR2 are HTTP shims for cross-vendor calls; with native bindings they're dead weight.
- `packages/db/` schema — replaced wholesale (Postgres → SQLite).
- NextAuth tables (`accounts`, `sessions`, `verification_tokens`) — replaced by Lucia tables.
- Vercel project — decommissioned at cutover (week 8).
- Neon database — decommissioned **after** D1 cutover proves stable for 2 weeks.

---

## The seven-phase incremental migration

Total realistic effort: **7–9 weeks for one engineer**, not 14 days. Each phase ends with deployable, testable software.

### Phase 0 — Pre-flight (2 days, week 0)

Before touching the SvelteKit app:

- [ ] **Inventory current routes:** generate a complete list of `apps/web/app/**/route.ts` and `page.tsx` files into `docs/superpowers/refactor/route-inventory.md`. Each gets a status column: `port-1to1`, `simplify`, `deprecate`.
- [ ] **Inventory schema usage:** every Drizzle table, every migration, list of Postgres-specific features in use (JSONB queries, transactions, RLS, triggers).
- [ ] **D1 budget check:** export current Neon row counts and rough byte sizes. Confirm we fit under D1's 10GB per-DB limit with headroom.
- [ ] **Create the new Cloudflare resources** (separate from existing — no overlap):
  - D1 database `shippie-platform-d1`
  - R2 bucket `shippie-apps-prod` (existing `shippie-apps` keeps serving until cutover)
  - KV namespace `shippie-platform-cache`
  - Worker name `shippie-platform`
- [ ] **GitHub OAuth client v2** registered with redirect `https://shippie.app/auth/callback/github` AND `https://next.shippie.app/auth/callback/github` (canary).
- [ ] **DNS:** add `next.shippie.app` CNAME to `shippie-platform.workers.dev` for canary.

Acceptance: list of resources + redirect URIs + sized DB plan, all in a single `docs/superpowers/refactor/preflight.md`.

### Phase 1 — SvelteKit shell (week 1)

Stand up the empty SvelteKit app at `apps/platform/`. Goal: deploy a hello-world to `next.shippie.app` with all bindings live and observable.

```
apps/platform/
  package.json                       SvelteKit + adapter-cloudflare + Lucia + Arctic + Drizzle (D1 driver)
  svelte.config.js                   adapter-cloudflare config
  vite.config.ts
  tailwind.config.js                 brand tokens lifted from apps/web/app/globals.css
  wrangler.toml                      D1 + R2 + KV + DO bindings, route shippie.app/* + *.shippie.app/*
  drizzle.config.ts                  Drizzle for D1
  src/
    app.html
    app.d.ts                         App.Locals, App.Platform with bindings
    hooks.server.ts                  hostname routing skeleton (returns "ok" for now)
    routes/+layout.svelte
    routes/+page.svelte              "Hello from CF Workers"
    lib/server/db/schema.ts          stub — empty users table only
  drizzle/
    0001_init.sql                    initial users table
```

Deploy: `wrangler deploy`. Visit `https://next.shippie.app` → see the hello page. Visit `https://abc.next.shippie.app` → hit hostname-routing fallback (404 with helpful message).

Acceptance: green deploy, visible at canary, all bindings resolve in `wrangler dev` AND prod.

### Phase 2 — D1 schema + dual-write infrastructure (week 2)

The migration's most error-prone part. Doing this BEFORE porting routes lets us run the rest of the work against a real DB.

- [ ] **Translate every Drizzle Postgres table to SQLite.** Use `drizzle-kit` to generate then hand-edit:
  - JSONB → TEXT, with a Drizzle helper `jsonb<T>()` that auto JSON.stringify/parse
  - UUID → TEXT with `randomBlob` default
  - Postgres enums → TEXT + CHECK constraint
  - Triggers (FTS sync) → SQLite-native FTS5 triggers
  - `auth.ts` (NextAuth schema) → Lucia schema (user, session, key — different shape)
- [ ] **Generate D1 migrations** in `apps/platform/drizzle/`. Run `wrangler d1 migrations apply shippie-platform-d1 --remote`.
- [ ] **Build a one-shot mirror script** `scripts/mirror-pg-to-d1.ts`:
  - Reads from current Neon
  - Transforms (uuid→hex, jsonb→string, enum→text, etc.)
  - Bulk-inserts into D1 via `wrangler d1 execute --remote` or REST API
  - Idempotent: identifies rows by primary key, upserts
- [ ] **Run the mirror**, verify counts match.
- [ ] **Set up dual-write** (write to BOTH Neon and D1 from the existing `apps/web/`). Wraps existing `getDb()` with a `dualWrite()` shim. Reads still go to Neon. This means: as we develop the SvelteKit app against D1, real writes from `apps/web/` keep D1 fresh.

Acceptance: D1 has every row that's in Neon. Dual-write works without breaking existing Vercel deploys. Read-from-D1 in canary returns the same data as read-from-Neon in prod.

### Phase 3 — Auth + session migration (week 3)

- [ ] **Lucia setup** in `apps/platform/src/lib/server/auth/`:
  - `lucia.ts` — D1Adapter, session cookie config (`.shippie.app` domain so subdomains see auth)
  - `github.ts` — Arctic GitHub provider
  - `google.ts` — Arctic Google provider
  - `email.ts` — magic-link via Resend (replaces NextAuth EmailProvider). Dev fallback prints to console (preserves existing dev UX).
- [ ] **Routes:**
  - `routes/auth/login/+page.svelte` — provider buttons, email-link form
  - `routes/auth/callback/[provider]/+server.ts` — OAuth callbacks
  - `routes/auth/email-link/[token]/+server.ts` — magic-link handler
  - `routes/auth/logout/+server.ts`
  - `routes/auth/cli/{device,poll,whoami,activate,approve}/...` — port the existing CLI device flow
- [ ] **`hooks.server.ts`:** validate session cookie, populate `event.locals.user` + `event.locals.session`.
- [ ] **CLI compatibility:** the CLI's `~/.shippie/token` format stays the same. The token contract between CLI and platform is what `packages/cli/` already implements. Add an adapter on the Lucia side to issue tokens with the same semantics.
- [ ] **Magic-link email migration:** users with active NextAuth sessions get a one-time email "we updated our auth — sign in once more here" at cutover. Dev users can use the dev-signin endpoint.

Acceptance: GitHub login works at `next.shippie.app`. Sign in, see your email in the session. CLI can `shippie login` against canary and get a token. Magic-link works (Resend in prod, console in dev).

### Phase 4 — Marketplace + maker app subdomains (weeks 4-5)

Port the user-facing surface. Order: read-only paths first (no risk of state divergence), then the deploy/management paths.

**Week 4: read-only paths**
- [ ] `routes/+page.svelte` — homepage (port from `apps/web/app/page.tsx`)
- [ ] `routes/apps/+page.svelte` + `+page.server.ts` — `/apps` marketplace, with FTS5 search
- [ ] `routes/apps/[slug]/+page.svelte` — app detail page (current `/apps/[slug]/page.tsx` honesty pass)
- [ ] `routes/leaderboards/+page.svelte` — `/leaderboards`
- [ ] `routes/why/+page.svelte` — `/why`
- [ ] `routes/docs/+page.svelte` — `/docs`
- [ ] `routes/i/[code]/+server.ts` — short invite redirect
- [ ] `routes/invite/[token]/+page.svelte` — invite claim page
- [ ] `routes/__shippie/data/+server.ts` — standalone Your Data fallback (port from `services/worker/src/router/your-data.ts`)
- [ ] **Subdomain routing** in `hooks.server.ts`: detect `*.shippie.app`, serve maker apps from R2, inject wrapper.

**Week 5: deploy + dashboard**
- [ ] `routes/new/+page.svelte` — three-card picker (upload zip / wrap URL / connect GH)
- [ ] `routes/api/v1/deploy/+server.ts` — zip deploy (port `app/api/deploy/route.ts`, keep contract)
- [ ] `routes/api/v1/deploy/wrap/+server.ts` — wrap deploy
- [ ] `routes/api/v1/deploy/path/+server.ts` — local path deploy
- [ ] `routes/api/v1/deploy/trial/+server.ts` — anonymous trial deploys
- [ ] `routes/dashboard/+layout.server.ts` — auth guard
- [ ] `routes/dashboard/+page.svelte` — dashboard home
- [ ] `routes/dashboard/apps/+page.svelte` — list maker's apps
- [ ] `routes/dashboard/apps/[slug]/+page.svelte` — app overview
- [ ] `routes/dashboard/apps/[slug]/access/+page.svelte` — visibility + invite management (port from existing)
- [ ] `routes/dashboard/apps/[slug]/analytics/+page.svelte`
- [ ] `routes/dashboard/feedback/+page.svelte`

Acceptance: every public-facing flow works at `next.shippie.app`. Upload a zip → live at `chiwit.next.shippie.app`. Sign in, see dashboard. Marketplace search returns hits. Lighthouse PWA 100 on a deployed maker app.

### Phase 5 — Wrapper rewriter port + Durable Objects (week 6)

- [ ] **Port `services/worker/src/rewriter.ts` as-is** to `apps/platform/src/lib/server/wrapper/rewriter.ts`. It's already CF Worker code; just import paths change.
- [ ] **Port the entire `services/worker/src/router/`** as `apps/platform/src/lib/server/wrapper/router/`:
  - `manifest.ts`, `sw.ts`, `sdk.ts`, `icons.ts`, `splash.ts` — same files
  - `proxy.ts` (URL-wrap reverse proxy) — same file
  - `signal.ts` (WebSocket signalling) — same file
  - `your-data.ts`, `group-moderate.ts` — same files
  - `feedback.ts`, `analytics.ts`, `beacon.ts`, `handoff.ts`, `push.ts`, `install.ts`, `local.ts`, `meta.ts`, `health.ts` — same files
- [ ] **Wire them into `hooks.server.ts`** under the `*.shippie.app` hostname branch, using a path prefix dispatcher.
- [ ] **Durable Objects:** export `SignalRoom` and any future `SyncRelay` from the SvelteKit Worker entry. Adapter handles this via `wrangler.toml` `[[durable_objects.bindings]]`.
- [ ] **`packages/cf-storage/` retirement:** remove all imports across the repo, replace with direct binding access (`platform.env.APPS`, etc.). Delete the package.

Acceptance: a deployed maker app at `chiwit.next.shippie.app` injects manifest, SW, SDK, your-data fallback, etc. — same as current `chiwit.shippie.app`. WebSocket signalling for whiteboard works through the new Worker. Whiteboard demo on canary works end-to-end.

### Phase 6 — Internal/admin + GitHub Actions + cron (week 7)

- [ ] `routes/api/v1/internal/{handoff,ingest-events,...}/+server.ts` — port internal endpoints. Replace `WORKER_PLATFORM_SECRET` HMAC checks with `event.locals.session?.user?.role === 'admin'` or remove the HMAC entirely (the Worker boundary is gone).
- [ ] `routes/api/v1/webhook/github/+server.ts` — GitHub App webhook receiver
- [ ] `routes/api/v1/oauth/[provider]/+server.ts` — OAuth coordinator (Drive/Dropbox)
- [ ] **GitHub Actions workflow** at `.github/workflows/shippie-build.yml`:
  - Triggered by `workflow_dispatch` from the platform
  - Clones repo, runs `npm install && npm run build`, detects output dir
  - Uploads to R2 via Cloudflare REST (since GH Action has no native bindings)
  - POSTs status back to platform's `/api/v1/deploy/callback` endpoint
  - **Honest deploy time: 2–5 minutes** for source-from-repo flows (cold runner + npm install)
- [ ] **Vercel Cron replacement:** `wrangler.toml [triggers] crons = [...]` + `scheduled` event handler routing to existing cron logic in `lib/internal/cron-*`. Schedules port 1:1.
- [ ] `routes/admin/+page.svelte`, `routes/admin/audit/+page.svelte` — admin surfaces, locked behind admin role.

Acceptance: deploy a GitHub-connected app via the new flow → see GH Actions run → app live at canary subdomain. Cron jobs fire at scheduled times. Admin pages auth-gate correctly.

### Phase 7 — Cutover + decommission (week 8)

Big day. Step-by-step:

- [ ] **T-7d:** dual-write running for full week. Sample comparison queries (`apps`, `users`, `app_ratings`) — D1 row counts equal Neon. No write divergence.
- [ ] **T-1d:** announcement banner on `shippie.app` — "we're upgrading our infrastructure for the next hour, your data is safe."
- [ ] **T-0:** flip DNS for `shippie.app` apex from Vercel → Cloudflare Pages/Worker. `*.shippie.app` already serves from CF Worker via the route pattern in `wrangler.toml`.
- [ ] **T+0 to T+1h:** monitor. Check: signin works, deploys work, marketplace renders, dashboards load, signal route accepts WebSocket upgrades, cron jobs fire.
- [ ] **T+1d:** disable dual-write — D1 is now sole source of truth.
- [ ] **T+7d:** Vercel project decommissioned. `apps/web/` deleted from main (kept in git history).
- [ ] **T+14d:** Neon database deleted (assuming D1 stable for 2 weeks).

**Roll-back trigger:** any of these in the first hour → roll DNS back to Vercel:
- 5xx rate >2% on signin or deploy endpoints
- D1 query latency p95 >500ms
- Any data divergence between dual-write traces

---

## Acceptance criteria — final cutover checks

- [ ] `shippie.app` serves from Cloudflare. Vercel returns 410 Gone or NXDOMAIN.
- [ ] `shippie.app/auth/login` → GitHub → returns to dashboard with valid session.
- [ ] `shippie.app/new` → upload chiwit.zip → live at `chiwit.shippie.app` in <60s.
- [ ] `shippie.app/api/v1/webhook/github` receives a push → GH Actions builds → R2 updated → live in 2–5min.
- [ ] `shippie.app/dashboard/apps/chiwit/access` → toggle private → invite link works.
- [ ] `chiwit.shippie.app/__shippie/data` reachable, shows storage breakdown.
- [ ] WebSocket from `whiteboard.shippie.app` to `/__shippie/signal/<roomId>` connects, fans out to peers.
- [ ] D1 query latency p95 <50ms (validated for 7 days post-cutover).
- [ ] Lighthouse PWA 100 on Recipe Saver, Whiteboard, Journal at their `*.shippie.app` URLs.
- [ ] Total monthly cost report: Cloudflare Workers Paid ($5) + DO usage (~$0.20–2) + R2 (free tier covers our scale) + D1 (free tier covers) + GH Actions (free for public repos) = **$5–10/mo** (spec said $5–20; reality skews lower).

---

## Risk register

| Risk | Mitigation |
|---|---|
| D1 hits 10GB ceiling | Phase 0 budget check; partition strategy ready (analytics_events to a second DB if needed) |
| GitHub Actions throttles on heavy build day | Use direct-zip path for fast deploys; only use Actions for source-clone flows. Move to Cloudflare Container Builds once GA. |
| All sessions break at cutover | Pre-cutover email to existing users with one-tap re-auth link; in-app re-login banner |
| Dual-write divergence | Mirror script also runs as a reconciliation job daily; alerts on any row-count delta |
| DNS propagation lag | Lower TTL to 60s a week before cutover; flip during low-traffic window |
| Existing CLI tokens stop working | Token format unchanged; Lucia issues with same shape; explicit test before cutover |
| WebSocket DO state lost on cutover | Active rooms drop. Acceptable: rooms are ephemeral, users rejoin |
| Existing GitHub App installations work | Webhook URL changes from `*-vercel.app/api/github/webhook` to `shippie.app/api/v1/webhook/github` — update GitHub App config day-of |
| Lighthouse regression on canary | Per-route perf budgets in CI before cutover; reject merges that exceed |

---

## What ships every week

| Week | Deployed |
|---|---|
| 0 | Pre-flight inventory + new CF resources provisioned |
| 1 | `next.shippie.app` returns hello, all bindings live |
| 2 | D1 has full Neon mirror; dual-write enabled in `apps/web/` |
| 3 | Auth works on canary; GitHub login round-trip green |
| 4 | Marketplace + app detail + invite flows live on canary |
| 5 | Deploy + dashboard live on canary; can ship Recipe Saver to canary subdomain |
| 6 | Wrapper rewriter ported; maker apps on canary fully functional including DO signalling |
| 7 | Internal/admin/cron/webhooks ported; GH Actions builds work |
| 8 | Cutover. `shippie.app` is Cloudflare. Vercel + Neon scheduled for decommission. |

---

## Post-cutover (week 9+) — the wins this unlocks

The vertical-integration win the spec describes is real. Once cutover is done:

- **Sub-ms internal latency.** A SvelteKit `+page.server.ts` that queries D1, reads KV, and serves R2 files runs in a single Worker invocation. Zero cross-vendor hops.
- **One deploy command.** `wrangler deploy` from `apps/platform/` deploys everything (platform + worker logic + DOs + cron). Replaces Vercel deploy + worker deploy + env-var sync dance.
- **Cost: $5–10/mo at current scale.** Spec said $5–20 but D1/R2/KV free tiers cover most of what we'd grow into.
- **Native bindings unlock features:** `caches.default` for edge caching, `event.waitUntil()` for background work post-response, Streams for live deploy logs, Durable Objects for any future stateful primitive without an extra service.
- **The cf-storage workspace deletion:** ~600 lines of HTTP-shim code we no longer maintain.
- **The HMAC dance deletion:** the platform↔worker signed-request system goes away. One service, no internal auth boundary.

This is the foundation everything in the post-cloud platform plan is supposed to run on. The 12-week post-cloud build is currently deployed to Vercel-via-this-refactor; until the refactor lands, the showcase apps work but don't realize the cost/latency wins.

---

## Reality check on timeline

The spec said 14 days. This plan says 8 weeks. The difference is honesty about scope:
- 49 routes to port × ~2 hours each = 98 hours = 2.5 weeks of pure typing
- Schema rewrite + data migration = 1 week
- Auth migration (with magic-link, OAuth, CLI device flow) = 1 week
- Wrapper rewriter port + DO + GH Actions + cron = 2 weeks
- Canary monitoring + cutover + decommission = 1.5 weeks

8 weeks is itself optimistic for one engineer with anything else on their plate. If shipping the post-cloud platform demos publicly is also active, this slips to 10–12 weeks.

If 8 weeks is too long: the order is right, just stop earlier. Phase 4 alone (canary running marketplace + deploy at `next.shippie.app`) is shippable on its own as "Shippie 2.0 preview" — keeps Vercel alive for prod, demos the new stack publicly. That's a 5-week milestone with a real moat.

---

## Addendum (2026-04-25 evening review)

### Parallel feature track — start week 3

**Total timeline becomes 12 weeks for refactor + first showcase apps shipped publicly, vs 20 weeks if sequential.** Feature work uses framework-agnostic packages — runs in parallel from week 3 once Phase 1 (shell) and Phase 2 (D1 schema) are stable.

Parallel-safe (touches only `packages/*` and `apps/showcase-*/`, no platform code):
- **Weeks 3–4:** Polish `packages/sdk/src/wrapper/observe/` rules (form-validate, list-swipe maturity, accessibility audit). Doesn't depend on platform — runs in browsers.
- **Weeks 3–5:** Whiteboard, Recipe, Journal apps to v0.9 quality. Vite-built, deployed via the SAME zip-upload contract — works against current `apps/web/` AND future `apps/platform/` because the contract is preserved.
- **Weeks 4–6:** Proximity Protocol hardening — turn on real-network TURN testing, miniflare end-to-end DO tests. Lives in `packages/proximity/`, not `apps/web/`.
- **Weeks 5–7:** Shippie AI app (`apps/shippie-ai/`) deployed to `ai.shippie.app` — separate static deploy, can ship before refactor lands. Already-built; just needs hosting.
- **Weeks 6–8:** Backup providers (Drive, Dropbox, WebDAV) — `packages/backup-providers/` is framework-agnostic. OAuth coordinator endpoint moves with the platform port.

Blocked-by-refactor (must wait for cutover):
- Domain custom-routing (depends on D1 + Worker KV bindings being native).
- Vercel-Cron-triggered jobs (must use Cloudflare scheduled triggers post-cutover).
- Anything that needs new endpoints in `apps/platform/` (those don't exist until they're ported).

**Practice:** keep the parallel work on a `feature/post-cloud-v2` branch. Merge to main only when both refactor and the feature are ready. Avoids dependency tangles where a feature accidentally calls a Next-only API that disappears at cutover.

### Cron job inventory + Cloudflare equivalents

Current crons in `vercel.json`:

| Path | Schedule | Purpose | Cloudflare scheduled trigger |
|---|---|---|---|
| `/api/internal/reconcile-kv` | `*/5 * * * *` (every 5min) | Re-writes `apps:{slug}:active` KV entries that disagree with DB. Backstops the deploy hot path's non-atomic KV write. | `*/5 * * * *` cron in `wrangler.toml [triggers]`; `scheduled` event handler dispatches to `lib/server/cron/reconcile-kv.ts` |
| `/api/internal/reap-trials` | `0 * * * *` (hourly) | Archives trial apps whose 24h TTL elapsed. | `0 * * * *` |
| `/api/internal/rollups` | `0 */1 * * *` (hourly) | Aggregates yesterday's `app_events` rows into `usage_daily` upserts. | `0 * * * *` |
| `/api/internal/retention` | `0 4 * * *` (daily 4am) | Drops `app_events_<YYYY_MM>` partitions older than 2 calendar months. | `0 4 * * *` |

The handler shape changes: instead of HTTP routes with `CRON_SECRET` auth, the Cloudflare `scheduled(event, env, ctx)` handler dispatches by `event.cron` string to the right function. Auth is implicit — only Cloudflare can fire it.

**Note on `retention`:** the cron drops Postgres table partitions. D1 doesn't have native partitioning. Replacement strategy: instead of dropping partitions, `DELETE FROM analytics_events WHERE created_at < datetime('now', '-60 days')` — slower but D1 handles it for our row counts. If volumes grow, partition by writing to monthly KV namespaces or a second D1 database.

### `cf-storage` retirement — exact migration map

Real importers (verified at HEAD):

| File | Lines | Current usage | New form |
|---|---|---|---|
| `apps/web/lib/deploy/index.ts` | 42, 775, 781, 788 | `import { CfKv, CfR2 }`; constructs `CfR2({accountId, apiToken, ...})` for apps + public buckets, `CfKv({...})` for namespace | In `apps/platform/src/lib/server/deploy/storage.ts`: receive `platform: App.Platform` from request context; use `platform.env.APPS.put/get/delete`, `platform.env.ASSETS.put/...`, `platform.env.CACHE.get/put`. **No constructor — bindings are objects.** |
| `apps/web/lib/deploy/kv.ts` | 15, 21, 32-46 | `buildCfKv()` constructs CfKv from env-var trio | Pass `platform.env.CACHE` directly; delete `buildCfKv()`. |
| `packages/cf-storage/` | whole package | Workspace package | **Deleted.** Remove from `package.json` workspaces array. |
| `packages/proximity/src/bun-test.d.ts` | comment ref | Just a code comment "matches shim in cf-storage" | Update comment, no dependency change. |
| `packages/backup-providers/src/bun-test.d.ts` | comment ref | Same | Same. |

Migration is **mechanical**: replace `CfKv` calls with `KVNamespace` calls (same method shapes — `get`, `put`, `delete`, `list`), replace `CfR2` with `R2Bucket` (same shape). Drop the env-var configuration; the platform binding is already configured.

`apps/web/lib/deploy/kv.ts` already has a `KvStore` interface. Keep that interface, write a `bindingKvStore(kv: KVNamespace): KvStore` adapter. Same for R2. ~30 lines of glue replaces ~600 lines of HTTP shim.

### Per-phase acceptance gates (integration tests, not just typecheck)

Each phase's "Acceptance" section gets these tests added:

**Phase 1 (shell):** Vitest + Playwright in `apps/platform/tests/`:
- `bindings.test.ts`: `wrangler dev` starts; `GET /` returns 200; D1 prepare-and-execute returns; R2 put/get round-trip; KV put/get; DO upgrade WebSocket.

**Phase 2 (D1 + dual-write):**
- `migration.test.ts`: row-count parity between Neon and D1 after mirror; sample row deep-equals after JSON column normalization.
- `dual-write.test.ts`: write to Neon via `apps/web/`, verify D1 sees same row within 5s; revert + retry.

**Phase 3 (auth):**
- `auth.test.ts`: GitHub OAuth round-trip via Playwright with mock GitHub; session cookie set; `/dashboard` reachable; logout clears session.
- `cli-auth.test.ts`: device flow start → poll → complete; `~/.shippie/token` issued; subsequent `/api/v1/whoami` returns the user.
- `magic-link.test.ts`: dev-mode prints link to console; clicking the link signs in; resend-mode exercises the Resend client via mock.

**Phase 4 (marketplace + maker subdomains):**
- `marketplace.test.ts`: GET `/apps` returns ≥1 row; FTS search hits indexed text; app detail page renders.
- `subdomain.test.ts`: deploy a tiny zip; `chiwit.next.shippie.app/` returns the index.html with `<script src="/__shippie/sdk.js">` injected; manifest URL serves valid JSON; SW URL serves valid JS.
- `invite.test.ts`: create a private app, generate invite, claim flow sets cookie, app detail page reachable.

**Phase 5 (deploy + dashboard):**
- `deploy.test.ts`: zip upload via API → R2 sees files → DB has deploy row → app subdomain serves.
- `dashboard.test.ts`: signed-in user sees their apps; can open access page; can flip visibility; invite list renders.

**Phase 6 (wrapper + DOs):**
- `rewriter.test.ts`: hit a maker subdomain HTML route; response body has SDK + manifest tags injected; CSP header has `frame-src https://ai.shippie.app`.
- `signal-do.test.ts`: WebSocket upgrade to `/__shippie/signal/<roomId>`; second client joins; messages from one client received by the other.
- `wrap.test.ts`: a wrapped URL deploy proxies upstream content with rewrites.

**Phase 7 (internal + GH Actions + cron):**
- `cron.test.ts`: invoke `scheduled` handler with each cron string; correct branch fires; idempotent on repeat.
- `gh-build.test.ts` (mocked GH API): trigger workflow_dispatch; receive callback; deploy row updates to `success`.
- `oauth-coordinator.test.ts`: state HMAC verify, popup callback, redirect fallback.

**Cutover (Phase 8):**
- 24-hour synthetic monitor: every 5 min hit `/`, `/auth/login`, `/apps`, `/dashboard`, `/__shippie/data` on canary. P95 latency, error rate, all logged. Cutover only proceeds if P95 < target and error rate < 0.5% for the full 24 hours.

### Observability + monitoring plan

The current Vercel observability story (build logs, runtime logs, web vitals) needs replacements before cutover. Concretely:

**1. Live request logs.**
- `wrangler tail --format=json` for live tailing during dev/debug.
- For prod: **Cloudflare Logpush** to R2 (cheapest), or to a Logflare/Axiom destination if structured search matters. Recommend Logpush to R2 for first 90 days; revisit if needed.
- Each Worker request logs: timestamp, hostname, path, status, latency, cf-ray, user-id (if signed in). Format: ndjson.

**2. Error tracking.**
- Wrap `hooks.server.ts` and the `scheduled` handler in a try/catch that POSTs to a `/api/v1/internal/error-sink` route. That route writes to D1 `errors` table with rate-limiting. Cheap, native, no third-party.
- Add Sentry only if/when error volume justifies it. Premature.

**3. Performance metrics.**
- Web Vitals already collected in `apps/web/.../web-vitals.ts`. Port to SvelteKit equivalent. Beacon endpoint already planned.
- Worker-side: Cloudflare's built-in Workers Analytics dashboard handles RPS, latency, error rate. Free.
- D1 query metrics: log slow queries (>100ms) to the same error sink with a "slow_query" tag.

**4. Uptime probes.**
- External: a single Pingdom / Better Stack / UptimeRobot free probe on `https://shippie.app/` and `https://shippie.app/api/health`. Free tiers cover this.
- Internal: a 5-min cron that hits its own `/api/health` and writes the result to `errors` table on failure.

**5. Deploy notifications.**
- Wrangler deploys post a Slack webhook (env-driven, optional). One line.
- GH Actions workflow notifies the same webhook on build success/failure.

**6. Audit log.**
- The existing `audit_log` D1 table records who-did-what for sensitive actions (visibility flips, invite creates, role changes). Already in the Postgres schema; survives the migration.

Total cost of this plan: $0/mo (free tiers + R2 ingestion at fractions-of-a-cent/GB). Adds ~250 lines of glue code distributed across the platform.

### Honest deploy-speed copy

The "60 second deploy" claim survives — but only on the path where the maker has already built the output. Marketing copy should reflect this:

| Path | Time | When it applies | Copy |
|---|---|---|---|
| Zip upload (web UI) | 30–60s | Maker uploads `dist/` zip | "Live in 60 seconds." |
| MCP deploy (AI tool) | 30–60s | AI tool sends pre-built files | "Live in 60 seconds." |
| CLI deploy `shippie ship` | 30–60s | Maker runs from project dir; CLI zips + uploads | "Live in 60 seconds." |
| Wrap mode | <10s | We don't host; just register the upstream | "Live instantly." |
| GitHub auto-deploy | 2–5min | Push to repo → webhook → GH Actions clones, builds, uploads | "Auto-deploys on push (typically 2–5 minutes)." |

Homepage hero: "Deploy in 60 seconds." Footnote: "GitHub auto-deploys take 2–5 minutes (we run the build for you)."

This is honest AND compelling. 60 seconds for the path most makers hit; 2–5 minutes for the convenience feature where we do the build work. Other platforms take 10+ minutes for the same "we run your build" flow — Shippie still wins on that path even at the slow end.

---

## Phase 0 deliverables (this commit)

Generated as part of accepting the plan:

- `docs/superpowers/refactor/route-inventory.md` — every route in `apps/web/`, with status column.
- `docs/superpowers/refactor/preflight.md` — D1 budget, schema usage audit, resource provisioning checklist for the user.

User actions for the rest of Phase 0 (cannot do autonomously — need CF + GitHub credentials):
- `wrangler d1 create shippie-platform-d1`
- `wrangler r2 bucket create shippie-apps-prod`
- `wrangler kv namespace create shippie-platform-cache`
- Register GitHub OAuth client v2 with both redirect URIs (canary + prod)
- Add DNS CNAME `next.shippie.app` → workers.dev hostname

I'll prep the README that walks you through these.
