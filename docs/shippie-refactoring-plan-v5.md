# Shippie — Refactoring Plan (v5: BYO Backend + Open Source)

## Context

Shippie has a working end-to-end platform (Weeks 1-11 complete). The user's review brief introduces a **strategic pivot**: Shippie becomes an open source platform that NEVER holds end-user data. The SDK wraps the maker's own backend (Supabase/Firebase), not Shippie's Postgres. This brief audits the existing code against 8 refinements and proposes a concrete 6-week refactoring plan.

**What prompted this**: Legal safety (Shippie as infrastructure, not data processor), positioning clarity (open source distribution layer, not an App Store competitor), and brand identity (Ship + Hippie counterculture).

**Intended outcome**: A publishable open source repo with BYO backend SDK, the platform itself as an installable PWA, square icon identity, CLI + MCP tooling, and clear documentation for public launch.

---

## Audit: What's Built vs What the Brief Wants

### KEEP (aligned with the brief, no changes needed)
- Deploy pipeline (zip upload, path build, preflight, PWA inject, R2, KV pointer)
- Worker core (Hono, slug resolution, file serving, CSP headers, rate limiting)
- Storefront + discovery (/apps, /apps/[slug], FTS + pg_trgm, ranking engine)
- Trust enforcement (malware scan, domain scanner, CSP builder, listing gate)
- Auto-packaging (compat report, changelog, QR, OG card)
- Organizations (create, invite, role gate, audit log)
- Platform auth (Auth.js for maker login to shippie.app)
- Build pipeline (framework detection, monorepo + AI-tool detection)
- Rate limiting (platform + worker, token bucket)
- Observability helper (withLogger)

### KEEP BUT STABILIZE FIRST (Week 0 — contract mismatches and stubs)
- **Feedback system** — works but identity model assumes platform sessions. Needs an identity bridge (Week 1) before the session system is removed. See `services/worker/src/router/feedback.ts:21` and `packages/db/src/schema/feedback.ts:36`.
- **Analytics ingest** — SDK emits a different payload shape (`packages/sdk/src/analytics.ts:18`) than what the platform route expects (`apps/web/app/api/internal/sdk/analytics/route.ts:16`). Worker enriches it, but there's no contract test ensuring alignment. Stabilize in Week 0.
- **Install tracking** — still stubbed in `services/worker/src/router/install.ts:13`. Implement real tracking in Week 0.

### REMOVE (conflicts with BYO backend — Shippie must not hold end-user data)

| File | Lines | Why |
|---|---|---|
| `services/worker/src/router/storage.ts` | 155 | Proxied end-user data to platform Postgres |
| `services/worker/src/router/auth.ts` | 200 | Platform-mediated OAuth for end-users |
| `services/worker/src/router/session.ts` | 43 | Session resolution for end-users |
| `services/worker/src/session/cookie.ts` | ~60 | Opaque handle cookie management |
| `services/worker/src/session/resolve.ts` | 72 | KV-cached session lookup |
| `apps/web/app/api/internal/sdk/storage/route.ts` | 168 | Platform-side storage with RLS |
| `apps/web/app/api/internal/session/authorize/route.ts` | ~80 | Session handle → claims resolution |
| `apps/web/app/api/internal/session/revoke/route.ts` | ~40 | Session revocation |
| `apps/web/app/api/oauth/authorize/approve/route.ts` | 95 | OAuth consent approval |
| `apps/web/app/api/oauth/token/route.ts` | ~120 | Code → handle exchange |
| `apps/web/app/oauth/authorize/page.tsx` | 298 | Consent screen |
| `apps/web/lib/oauth/client.ts` | ~60 | OAuth client registration |
| `apps/web/lib/oauth/pkce.ts` | ~30 | PKCE verification |
| `apps/web/lib/internal/signed-request.ts` | ~30 | HMAC verification (still used by feedback/analytics) |

**Note**: `signed-request.ts` is still needed by feedback + analytics internal routes. Don't delete it.

### DEPRECATE (freeze, don't delete — may return for Tier 3)

| File | Reason |
|---|---|
| `services/worker/src/router/fn.ts` | Functions need rethinking without platform sessions |
| `apps/web/app/api/internal/fn/invoke/route.ts` | Same |
| `apps/web/app/api/deploy/functions/route.ts` | Same |
| `apps/web/app/api/deploy/functions/secrets/route.ts` | Same |
| `apps/web/lib/functions/runner.ts` | Same |
| `apps/web/lib/functions/secrets-vault.ts` | Same |

### SCHEMA (soft deprecation — never drop tables with applied migrations)

Mark as deprecated in code comments, stop writing new rows:
- `app_sessions` — was for opaque handle sessions
- `app_data` / `app_files` — was platform-hosted storage
- `oauth_clients` / `oauth_authorization_codes` / `oauth_consents` — was platform OAuth
- `function_deployments` / `function_secrets` / `function_logs` — frozen

New migration 0009:
```sql
ALTER TABLE apps ADD COLUMN backend_type text; -- 'supabase' | 'firebase' | null
ALTER TABLE apps ADD COLUMN backend_url text;
```

### REFACTOR (major changes to existing code)

**SDK (`packages/sdk/src/`)** — the biggest refactor:
- Add `shippie.configure({ backend: 'supabase', client: <SupabaseClient> })` — maker passes an already-initialized client instance. No raw-config overload; the SDK never constructs backend clients itself.
- `auth.ts`, `db.ts`, `files.ts` delegate to a `BackendAdapter` interface
- Tier 1 (no backend configured): auth/db/files throw helpful errors
- Tier 2 (BYO): wraps maker's initialized client via the adapter
- `http.ts` stays as-is for feedback/analytics/install/meta (still /__shippie/*)
- `feedback.ts`, `analytics.ts`, `install.ts`, `meta.ts` unchanged

**Deploy pipeline (`apps/web/lib/deploy/index.ts`)**:
- Remove `ensureOauthClient()` call (line ~254)
- Remove KV `apps:{slug}:oauth` write (lines ~279-282)
- Keep everything else (preflight, PWA inject, R2, autopack, ranking, trust)

**Worker system router (`services/worker/src/router/system.ts`)**:
- Remove routes: `/auth`, `/session`, `/storage`, `/fn`
- Keep routes: `/health`, `/meta`, `/sdk.js`, `/manifest`, `/sw.js`, `/icons`, `/install`, `/feedback`, `/analytics`

**PWA injector (`packages/pwa-injector/src/generate-manifest.ts`)**:
- Change icon purpose from `'any maskable'` to `'any'`
- Enforce square dimensions in icon metadata

**Storefront UI**:
- Replace `rounded-2xl`/`rounded-3xl` icon CSS with sharp square (`rounded-none`)
- Remove gradient backgrounds (linear-gradient heroes)
- Swiss/utilitarian design tokens

### NEW WORK

| Item | Package/Location | License |
|---|---|---|
| Platform PWA | `apps/web/public/manifest.json`, `sw.js`, layout updates | AGPL |
| SDK backend adapters | `packages/sdk/src/backends/` | MIT |
| CLI package | `packages/cli/` | MIT |
| MCP server | `packages/mcp-server/` | MIT |
| Docker self-host | `docker-compose.yml`, Dockerfiles | AGPL |
| GitHub App integration | `apps/web/lib/github/`, webhook route | AGPL |
| Template repos | `templates/shippie-starter/` etc. | MIT |
| Documentation | `docs/getting-started.md`, etc. | — |
| License files | `LICENSE` (AGPL), `LICENSE-MIT` | — |

---

## 7-Week Build Plan

### Week 0: Contract Stabilization

**Goal**: Fix runtime stubs and shape mismatches before the pivot so we're building on a stable base.

1. **Analytics shape alignment** — the SDK (`packages/sdk/src/analytics.ts:18`) emits `{ events: [...] }` but the platform ingest route (`apps/web/app/api/internal/sdk/analytics/route.ts:16`) expects `{ user_id, app_id, slug, scope, events }`. The worker (`services/worker/src/router/analytics.ts`) is supposed to enrich the payload, but currently passes `events` through without normalizing individual event shapes (e.g., `event_name` vs `name`, `properties` vs `data`). Fix: audit the actual field names at each boundary (SDK → worker → platform) and align them into one canonical shape. Then add a contract test that sends an SDK-shaped payload through the worker and asserts the platform receives the expected fields.
2. **Install tracking stubs** — `services/worker/src/router/install.ts:13` returns placeholder JSON. Implement real install event recording: accept POST with `{ event, outcome }`, proxy to a new `/api/internal/sdk/install` platform route that writes to `analytics_events` with `event_name = 'install_*'`. No new table needed.
3. **Meta route enrichment** — `services/worker/src/router/meta.ts:12` returns a limited KV shape. Add `backend_type` to the meta response so the SDK can auto-detect backend config at runtime (needed for Week 1 runtime bootstrap).
4. **Dead route audit** — verify that every `/__shippie/*` route that will be removed in Week 1 currently returns working responses, so the removal is clean. Document the before/after contract in `docs/specs/`.

### Week 1: SDK Pivot + Dead Code Removal + Identity Bridge

**Goal**: Ship the new SDK architecture. Remove data-holding paths. Solve identity for feedback/analytics post-session-removal.

1. Create `packages/sdk/src/backends/types.ts` — `BackendAdapter` interface:
   ```typescript
   interface BackendAdapter {
     auth: { signIn(), signOut(), getUser(), onChange() }
     db: { set(), get(), list(), delete() }
     files: { upload(), get(), delete() }
   }
   ```
2. Create `packages/sdk/src/backends/supabase.ts` — wraps a user-provided `SupabaseClient` instance (NOT bundled — passed via `configure()`)
3. Create `packages/sdk/src/configure.ts` — stores adapter, provides `getAdapter()` with clear error if unconfigured
4. Refactor `packages/sdk/src/index.ts` — add `shippie.configure()`, delegate `auth/db/files` to adapter
5. Refactor `packages/sdk/src/auth.ts` — call `getAdapter().auth.*` instead of `/__shippie/auth/*`
6. Refactor `packages/sdk/src/db.ts` — call `getAdapter().db.*` instead of `/__shippie/storage/*`
7. Refactor `packages/sdk/src/files.ts` — call `getAdapter().files.*`
8. `http.ts` stays — still used by feedback, analytics, install, meta
9. Remove from `system.ts`: auth, session, storage, fn routes
10. Delete: `router/storage.ts`, `router/auth.ts`, `router/session.ts`, `session/` directory
11. Deprecate: `router/fn.ts` (keep file, remove from system.ts)
12. Remove platform API routes: `api/internal/sdk/storage/`, `api/internal/session/`, `api/oauth/`
13. Remove `lib/oauth/` directory
14. Update `lib/deploy/index.ts` — remove `ensureOauthClient()` and KV oauth writes
15. Add `ShippieJsonBackend` to `packages/shared/src/shippie-json.ts`
16. Migration 0009: `backend_type` + `backend_url` on `apps`
17. Update `packages/session-crypto/` — mark as deprecated (only feedback/analytics signed requests still use the HMAC helpers from `platform-client.ts`)

**Identity bridge** (solves Codex finding: feedback/votes still assume platform sessions):

18. Refactor `services/worker/src/router/feedback.ts` — currently calls `requireSession()` which depends on the removed session system. Replace with a **lightweight identity model**:
    - **Supabase path (Week 1):** feedback accepts an `Authorization: Bearer <supabase_jwt>` header. The worker forwards the JWT to the platform. Platform validates it by fetching the app's JWKS from `{backend_url}/auth/v1/.well-known/jwks.json` (Supabase's standard endpoint), verifies signature + expiry, extracts `sub` as `external_user_id`. JWKS responses are cached for 1 hour.
    - **Firebase path (Week 6):** same pattern but JWKS endpoint is `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com` and `iss` must match `https://securetoken.google.com/{project_id}`. Added when Firebase adapter ships.
    - **No backend (Tier 1):** anonymous feedback only. Rate-limited by IP hash. Votes disabled (require identity).
    - The identity bridge is **Supabase-only at launch**. Firebase and other providers follow the same JWT pattern but with provider-specific JWKS endpoints, validated when each adapter ships. The platform stores `backend_type` on the app row so it knows which JWKS endpoint to use.
19. Refactor `packages/db/src/schema/feedback.ts:36` — `user_id` already references `users(id)`. For BYO users who don't exist in Shippie's `users` table, add a `external_user_id text` column + `external_user_display text` to `feedback_items`. This lets feedback carry identity from Supabase/Firebase without requiring a Shippie account.
20. Same for `feedback_votes` — add `external_user_id text` as alternative to `user_id`. Drop the composite PK. Use a surrogate `id uuid` PK instead, plus two partial unique indexes:
    - `CREATE UNIQUE INDEX feedback_votes_internal_uniq ON feedback_votes (feedback_id, user_id) WHERE user_id IS NOT NULL;`
    - `CREATE UNIQUE INDEX feedback_votes_external_uniq ON feedback_votes (feedback_id, external_user_id) WHERE external_user_id IS NOT NULL;`
    - `ALTER TABLE feedback_votes ADD CONSTRAINT exactly_one_identity CHECK ((user_id IS NOT NULL) != (external_user_id IS NOT NULL));`
    This prevents double-voting by either identity type without requiring a `COALESCE` expression in the PK.
21. Feedback worker route: if `Authorization: Bearer` header present, forward it. If `__shippie_session` cookie present (deprecated path), still works for backward compat during migration. If neither, accept anonymous submission (rate-limited by IP).

**Runtime bootstrap** (solves Codex finding: how do script-tag SDK consumers configure Supabase?):

22. The deploy pipeline writes `backend_type` + `backend_url` into KV at `apps:{slug}:meta` during deploy (anon keys are NOT stored in KV — they're in the maker's own code).
23. `/__shippie/meta` returns `backend_type` and `backend_url` in its JSON response.
24. **Script-tag bootstrap (two-step, no bundled backends):** `/__shippie/sdk.js` is currently a static bundle. Change: the worker prepends `window.__shippie_meta = { backend: "supabase", url: "..." };` before the SDK bundle. This is metadata only — NOT a configured client. The SDK reads this on load but does NOT auto-initialize a backend. Instead, the maker must still include their own backend SDK (`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js">`) and call `shippie.configure({ backend: 'supabase', client: supabase })`. The `__shippie_meta` just tells the SDK which adapter to expect so it can give better error messages (e.g., "This app uses Supabase — call shippie.configure() with your Supabase client").
25. **Tier 1 (static, no backend):** `__shippie_meta.backend` is `null`. SDK feedback/analytics/install work. `auth/db/files` throw: "This app has no backend configured."
26. npm consumers call `shippie.configure()` explicitly — identical contract, no magic globals.

**Docs/spec cutover** (solves Codex finding: v6 spec still documents removed routes):

26. Update `docs/specs/shippie-implementation-plan-v6.md` — mark `/__shippie/session`, `/__shippie/auth/*`, `/__shippie/storage/*`, `/__shippie/fn/*` as **removed in v5 pivot**. Add a "v5 supersession notice" at the top referencing this refactoring plan.
27. Update the reserved route contract table to reflect the post-pivot surface (health, meta, sdk.js, manifest, sw.js, icons, install, feedback, analytics only).

### Week 2: Square Icons + Platform PWA + Brand Refresh

**Goal**: shippie.app is installable. Square icons everywhere. No gradients.

1. `packages/pwa-injector/src/generate-manifest.ts` — icon purpose to `'any'`
2. `services/worker/src/router/icons.ts` — enforce square output, reject/crop non-square
3. Create `apps/web/public/manifest.json` — platform manifest (name: "Shippie", square icon, standalone, theme_color #0a0a0a)
4. Create `apps/web/public/icons/` — square platform icon at 192, 512
5. Create `apps/web/public/sw.js` — offline shell caching for storefront pages (network-first for API, cache-first for assets, offline fallback page)
6. Update `apps/web/app/layout.tsx` — add manifest link, apple-mobile-web-app-capable, SW registration, favicon
7. Update `apps/web/app/globals.css` — utilitarian design tokens: no gradients, flat bg, system-ui or Inter stack, high-contrast borders, monospace accents
8. Update storefront pages: `apps/page.tsx`, `apps/[slug]/page.tsx` — square icon rendering (`rounded-none`), remove gradient hero, flat layout
9. Update `apps/web/app/page.tsx` — landing page redesign: counterculture tone, clear install CTA, no SaaS gradients
10. Add install prompt component that detects iOS vs Android and shows appropriate instructions

### Week 3: CLI + Open Source Prep

**Goal**: `npx @shippie/cli deploy` works. Repo is licensable and self-hostable.

1. Create `packages/cli/` — commander-based CLI:
   - `deploy` — auto-detect output dir, zip, POST to `/api/deploy`
   - `init` — scaffold `shippie.json` interactively
   - `login` — browser-based device auth flow
   - `whoami` — show current auth state
2. Add `LICENSE` (AGPL-3.0) at repo root
3. Add `LICENSE-MIT` and apply to `packages/sdk/`, `packages/cli/`
4. Create `docker-compose.yml` — Postgres + web + worker (Bun-based images)
5. Create `Dockerfile.web`, `Dockerfile.worker`
6. Write `CONTRIBUTING.md`
7. Write `docs/self-hosting.md`
8. Write `docs/getting-started.md` — zero to deployed in 5 minutes
9. Write `README.md` — one-liner, install CLI, self-host, architecture overview, contributing link

**CI/release gate** (solves Codex finding: placeholder test/lint scripts, no CI):

10. Create `.github/workflows/ci.yml` — runs on PR + push to main:
    - `bun install`
    - `bun run typecheck` (turbo, all packages)
    - `bun run test` (currently placeholder — replace with real smoke fixtures below)
    - `bun run lint` (currently placeholder — wire to biome or eslint)
11. Replace placeholder test scripts in `apps/web/package.json:12`, `packages/sdk/package.json:23`, `services/worker/package.json:9` with actual test commands.
12. Create smoke test fixtures:
    - `packages/sdk/src/__tests__/configure.test.ts` — adapter selection, error on unconfigured
    - `apps/web/lib/deploy/__tests__/deploy-static.test.ts` — zip → preflight → R2 (uses PGlite)
    - `services/worker/src/__tests__/routes.test.ts` — health, meta, feedback return correct status codes
13. Add `npm publish --dry-run` step to CI for `packages/sdk`, `packages/cli`, `packages/mcp-server` — catches packaging issues before real publish.

### Week 4: GitHub App Integration

**Goal**: Connect repo, auto-deploy on push.

1. Create `apps/web/lib/github/app.ts` — JWT auth, installation token generation
2. Create `apps/web/lib/github/clone.ts` — clone to tmp dir, feed `buildFromDirectory()`
3. Create `apps/web/app/api/github/webhook/route.ts` — handle `push` event, trigger build+deploy
4. Create GitHub App installation flow in dashboard (connect repo, select branch)
5. Wire `apps.github_repo`, `apps.github_branch`, `apps.github_installation_id` columns (already exist)
6. Create deploy button generator — markdown badge + redirect to `shippie.app/deploy?repo=<url>`
7. Create `apps/web/app/deploy/page.tsx` — deploy-from-URL page (clone, build, publish)
8. Create `.github/actions/deploy/action.yml` — reusable GitHub Action

### Week 5: Custom Domains + Business Tier

**Goal**: Makers can bring their own domain. Full host resolution pipeline.

**Custom domains — full workstream** (expanded per Codex finding):

1. Migration 0010: `custom_domains` table (domain, app_id, verified_at, ssl_provisioned, canonical boolean)
2. Create `/apps/web/app/api/domains/` — add, verify DNS TXT, remove, set canonical
3. **Host resolution overhaul** in `services/worker/src/routing.ts`:
   - Current: `resolveAppSlug()` returns `null` for unknown hosts → 400 in `app.ts:30`
   - New: add a KV lookup path: `custom-domains:{hostname}` → `{ slug, canonical }`. If the custom domain is non-canonical, 301 redirect to the canonical domain. If unknown host AND not a `*.shippie.app` subdomain → 400.
   - Edge case: maker adds `app.example.com` pointing to their `recipes.shippie.app`. Both must serve the same app. Only the canonical one appears in `<link rel="canonical">`.
4. **Canonical redirect middleware** — if request arrives on non-canonical domain, 301 to canonical. This prevents duplicate content and establishes clear ownership.
5. **DNS TXT verification flow**:
   - Platform generates a random token: `_shippie-verify.example.com TXT shippie-verify=abc123`
   - API checks DNS via `dns.resolveTxt()` (Node) or Cloudflare DNS-over-HTTPS API
   - On success, mark `custom_domains.verified_at = now()`
   - Cron re-checks verification weekly; badge removed if TXT gone
6. **SSL**: In production, Cloudflare for SaaS handles SSL automatically for custom domains. In dev, custom domains just map to localhost (no SSL needed).
7. **Regression tests**: test `resolveAppSlug()` with: subdomain, custom domain, unknown host, IP-only host, localhost variants.
8. Dashboard domain management UI (add, verify status, set canonical, remove)

**Business tier**:

9. Add forking toggle to apps (`forkable` boolean column, fork button on detail page)
10. Define pricing tiers (free/pro/business) in shared config
11. Verified maker badge on listings (DNS-verified domain)

### Week 6: MCP Server + Firebase Adapter + Templates + Polish

**Goal**: Complete the integration suite. Ship.

1. Create `packages/mcp-server/` — deploy, status, logs as MCP tools (MIT)
2. Create `packages/sdk/src/backends/firebase.ts` — Firebase adapter
3. Create `templates/shippie-starter/` — minimal static tool (MIT)
4. Create `templates/shippie-supabase/` — stateful app with Supabase (MIT)
5. End-to-end test: deploy static app via CLI, deploy Supabase app via CLI
6. Full README polish
7. Write `docs/sdk-reference.md`
8. Write `docs/deploy-button.md`
9. Write `docs/going-pro.md`
10. Publish to npm: `@shippie/sdk`, `@shippie/cli`, `@shippie/mcp`

---

## Key Design Decisions

### SDK adapter pattern — accept initialized client, don't bundle backends

```typescript
// npm usage (explicit configure)
import { createClient } from '@supabase/supabase-js'
import { shippie } from '@shippie/sdk'

const supabase = createClient(url, anonKey)
shippie.configure({ backend: 'supabase', client: supabase })

await shippie.auth.signIn()       // wraps supabase.auth.signInWithOAuth()
await shippie.db.set('recipes', id, data)  // wraps supabase.from('recipes').upsert()
```

```html
<!-- script-tag usage (maker must still include their backend SDK) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
<script src="/__shippie/sdk.js"></script>
<script>
  // /__shippie/sdk.js injects window.__shippie_meta = { backend: "supabase", url: "..." }
  // but does NOT auto-configure. Maker must still initialize:
  const sb = supabase.createClient(window.__shippie_meta.url, 'their-anon-key')
  shippie.configure({ backend: 'supabase', client: sb })
</script>
```

The SDK does NOT `import '@supabase/supabase-js'` — the maker passes their already-initialized client. `window.__shippie_meta` is informational only (tells the SDK which backend to expect for better error messages). This keeps the SDK bundle tiny (~5KB) and avoids version conflicts.

### What Shippie still owns (not BYO)

| Surface | Why it stays |
|---|---|
| Feedback (`/__shippie/feedback`) | Low-sensitivity platform data, drives the marketplace |
| Analytics (`/__shippie/analytics`) | Anonymized events for ranking + maker dashboard |
| Install tracking (`/__shippie/install`) | Platform UX signal |
| Meta/Health/Manifest/SW/Icons/SDK | Core PWA infrastructure |
| Static file serving | The fundamental value prop |

### session-crypto package fate

`@shippie/session-crypto` currently exports `signWorkerRequest`, `verifyWorkerRequest`, `hashHandle`, `generateSessionHandle`, `generateNonce`. After the pivot:
- `signWorkerRequest` / `verifyWorkerRequest` — still used by feedback + analytics internal routes (worker → platform HMAC signing)
- `hashHandle` / `generateSessionHandle` — dead (session system removed)
- `generateNonce` — dead

Keep the package, remove dead exports in a follow-up.

### Platform-client.ts in worker stays

`services/worker/src/platform-client.ts` provides `platformFetch` / `platformJson` with HMAC signing. This is still used by:
- `router/feedback.ts` → `/api/internal/sdk/feedback`
- `router/analytics.ts` → `/api/internal/sdk/analytics`

Not removed.

---

## Verification Plan

After each week, verify:

**Week 0**: Analytics worker → platform payload shape is contract-tested. Install tracking POST records an event. `/__shippie/meta` returns `backend_type`. All routes that will be removed in Week 1 are documented with current response shapes.

**Week 1**: `bun run typecheck` passes. Deploying a static app works. `shippie.configure()` exists in SDK. Calling `shippie.auth.signIn()` without configuring throws a clear error. Calling `shippie.feedback.submit()` still works (anonymous path). Old storage/auth/session routes return 404. `/__shippie/sdk.js` includes bootstrap snippet with backend config from KV. v6 spec has supersession notice. Feedback accepts `Authorization: Bearer` header for BYO identity.

**Week 2**: `shippie.app` is installable as a PWA on iOS (guided) and Android (one-click). Icon in storefront renders as sharp square. No gradient backgrounds anywhere. Lighthouse PWA audit passes.

**Week 3**: `npx @shippie/cli deploy ./my-app` uploads and deploys. `docker-compose up` starts the full stack. LICENSE files present. CI workflow runs typecheck + tests + lint + publish dry-run. At least 3 smoke test files pass.

**Week 4**: Push to a connected GitHub repo triggers auto-deploy. Deploy button badge in a README works. GitHub Action deploys from CI.

**Week 5**: Custom domain serves the app after DNS verification. Non-canonical domain 301-redirects to canonical. Unknown host returns 400. Verified badge shows on listing. `resolveAppSlug` regression tests pass.

**Week 6**: MCP `deploy` tool works from Claude Code. Firebase adapter works. Templates clone and deploy. npm packages published.

---

## Files to Read Before Starting Week 1

- `packages/sdk/src/index.ts` — current SDK shape, add configure()
- `packages/sdk/src/http.ts` — keep for platform paths, backends bypass this
- `packages/sdk/src/auth.ts` — refactor to adapter delegation
- `packages/sdk/src/db.ts` — refactor to adapter delegation  
- `packages/sdk/src/files.ts` — refactor to adapter delegation
- `services/worker/src/router/system.ts` — remove 4 routes
- `apps/web/lib/deploy/index.ts` — remove OAuth client registration
- `packages/shared/src/shippie-json.ts` — add ShippieJsonBackend

---

_The v4 implementation plan below is superseded by this v5 refactoring plan. Kept as historical reference._

