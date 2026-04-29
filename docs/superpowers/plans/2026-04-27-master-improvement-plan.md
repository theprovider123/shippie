# Master Improvement Plan — 2026-04-27

> Strategic spine for Shippie. Synthesizes the long-form vision (local-first transformation, MCP as the maker OS, deploy intelligence, update safety, private analytics, mesh, federation) with the prior 9-phase plan. Sequenced so each phase compounds the value of the next. Replaces ad-hoc planning.

## Verdict on the prior 9-phase plan

Largely sound. Five reframings:

1. **No Day-0 punch list.** Phase 1's "stabilize" items are 1-line fixes that don't deserve a phase label.
2. **Wrapper SDK is a dev stub.** `/__shippie/sdk.js` serves placeholder code today because `sdk/v1.latest.js` isn't in `PLATFORM_ASSETS` R2. Every downstream claim (proof, kind, install, analytics, feedback, Whispers) depends on a real bundle. Must precede Deploy Truth MVP.
3. **MCP belongs at Phase 1, not Phase 8.** The compound multiplier argument is correct. Building 7 phases without it is leaving leverage on the table.
4. **Phase 9 is mis-sequenced.** "Hub as local Shippie" informs design decisions in earlier phases (data shape, deploy report portability, score artifact format). Either move parts forward or accept lock-in.
5. **No recurring ethos audit.** Every phase must check: *"Does this lock us into Cloudflare or keep the path to a self-hosted Hub open?"*

## Strategic anchor

Accept every app. Classify honestly. Improve safely. Prove claims at runtime. Offer a path toward Local without pretending every Cloud app can be magically transformed. Practice the ethos in the platform itself.

## Day-0 punch list

One sitting. Quick bug fixes only — anything that depends on real metadata/proof boot belongs in Phase 1A, not here.

- [x] Fix `bun run lint` in `apps/platform/package.json`
- [x] Read allowed hosts from current config (not first-call closure) in `packages/sdk/src/wrapper/kind-emitter.ts`
- [x] Move `?kind=` filter into the DB query in `apps/platform/src/routes/apps/+page.server.ts`
- [ ] Production smoke: verify SignalRoom Durable Object exports correctly after `wrangler deploy`

> Auto-configuring proof + kind emitters from app metadata moved to Phase 1A — it requires the real SDK bundle and metadata boot path, which doesn't exist until then.

## Phase 1 — Two parallel tracks

Phase 1 is split because runtime truth and maker multiplier are independent unblockers. Both must land before Phase 2 starts; they can be worked in parallel.

### Phase 1A — Real Runtime

The keystone fix. Until this ships, every later phase that depends on the SDK is theoretical.

- Build `@shippie/sdk` IIFE bundle from `packages/sdk/src/wrapper/index.ts`
- Upload to `PLATFORM_ASSETS/sdk/v1.latest.js` via the platform deploy pipeline (bundled into `wrangler deploy` for now — move to versioned `sdk/v1.0.3.js` + rollback pointer once release discipline exists)
- Auto-load app metadata into the SDK on boot
- Auto-configure proof + kind emitters from metadata so makers don't wire them manually
- Verify SW registration, install capture, analytics beacon, feedback widget, and Whisper rendering all work against the real bundle (not the stub)
- The dev stub stays as the fallback — never breaks if the bundle is missing

**Ethos check:** SDK works fully offline once cached. Airplane-mode test.

**Definition of done:** every claim in Phases 2-6 has a real runtime to sit on. Stub is fallback only.

### Phase 1B — Maker Multiplier

Foundations that compound across every later phase. Must include the shared-core scaffold from day one — even minimal — so we don't build deploy logic twice.

- **`packages/shippie-core/`** scaffolded with the smallest useful surface: `deploy()`, `appsList()`, `auth()`. MCP and CLI both consume this. No re-implementation later.
- **Minimal MCP server** in `packages/mcp-server/` (already exists, trim and refocus):
  - **Resource:** `shippie_sdk_reference` — markdown of every `shippie.local.*`, `shippie.feel.*`, `shippie.device.*` method
  - **Tool:** `shippie_deploy` — calls `core.deploy()`
  - **Tool:** `shippie_apps_list` — calls `core.appsList()`
  - Auth via CLI bearer token (already wired)
- **Distribution:** ship `npx @shippie/mcp` first for lowest friction. Long-term: bundle with CLI.
- **Ethos check:** MCP works against `https://shippie.app` AND `http://hub.local` with one env var flag.

**Definition of done:** `npx @shippie/mcp` installs cleanly; Claude Code scaffolds an app using `shippie.local.db.*`; `shippie_deploy` ships it in under 60s; the deploy code path is the same one the future CLI will call.

## Phase 2 — Deploy Truth MVP

Build deploy intelligence around the existing pipeline. All steps run in parallel where possible.

- **Framework detect:** Vite, SvelteKit static, Next static export, React, Svelte, plain HTML, Expo Router
- **Output normalize:** find `dist`, `build`, `out`, `.output/public`, `_site`, root `index.html`
- **SPA/MPA detection:** single-`index.html`+JS-router → SPA fallback; multiple HTMLs → MPA + branded 404
- **Missing essentials:** viewport meta, charset, lang, favicon (generated from theme color), OG tags, manifest link
- **Asset path repair:** scan HTML/CSS, fix broken refs by searching the file tree
- **Security scan:** hardcoded secrets (API keys, JWT patterns), external `<script src=>` from unknown domains, mixed content, inline `onclick=`
- **Privacy audit:** outbound domain extraction from JS, classify as local/connected/cloud
- **Kind classification:** already exists; promote to first-class report section
- **Health check (in critical path, lightweight):** `index.html` 200, manifest valid + parses, SW registers, all referenced assets resolve, basic installability (manifest + SW + theme color present). Must stay fast — synchronous deploy budget is 60s end-to-end.
- **Full Lighthouse run (out of critical path):** runs async after deploy goes live, sampled or scheduled, results attached to the deploy report when ready. Or attached only to preview deploys, not production.

**Output:** a `deploy-report.json` artifact stored in R2 alongside the build, plus a normalized record in D1.

**Ethos check:** report is a static artifact (portable to a Hub), not just a DB row.

**Definition of done:** every deploy produces a structured report saying *what we detected, what we fixed, what we blocked, what kind this app is*.

## Phase 3 — Deploy Stream

Plumbing for the report to feel alive.

- **Event model:** `deploy_received`, `framework_detected`, `security_scan_started`, `secret_detected`, `asset_fixed`, `pwa_generated`, `kind_classified`, `health_check_passed`, `deploy_live`, `deploy_failed`
- **Transport:** SSE from `/api/deploy/[id]/stream`; events stored in R2 as append-only NDJSON for replay
- **Consumers:** MCP tool output, CLI `--stream` flag, dashboard deploy screen
- Each event is content-addressable so a Hub can replay locally

**Ethos check:** events portable to Hub; stream replay works without internet.

**Definition of done:** running `shippie deploy` shows a live stream identical to the dashboard's; both come from the same event source.

## Phase 4 — Security / Privacy / Trust scores

Ship in two stages. Wrong scores destroy trust faster than they create it, so the public surface waits until the scanner has proven itself.

### Stage A — Maker-facing (private)

- **Security report** generated per deploy: hardcoded secrets, external scripts, mixed content, vulnerable patterns. Visible only to the maker on the deploy page.
- **Privacy report** generated per deploy: outbound domains, classification (local / connected / cloud).
- Numeric scores computed but **not** shown to users yet.
- Used internally to tune weights, harden the scanner, build test corpus.

### Stage B — User-facing (public)

Promote to public surface only when:
- Scanner has high test coverage across representative apps
- False-positive rate is low (audited against a set of known-clean apps)
- Every deduction can be explained in one sentence

Then:
- **Security score (0–100):** weighted from Phase 2 scan results. Every deduction explainable.
- **Privacy grade (A+ → F):** A+ = no external; A = external data only; B = cached external; C = real-time external; F = trackers / exfiltration.
- **Trust card** shown on first launch: generated from kind + score + grade. Re-shown only on **major trust posture changes** (kind changes Local→Connected; new external domain; new feedback/analytics behavior; security score drop).
- **Shippie Seal:** further deferred until proof events have meaningful coverage. Eligibility = security ≥95, privacy A+, Lighthouse 100, full offline.

**Ethos check:** scores computed from artifacts, not opaque ML; same code runs on Hub.

**Definition of done (Stage A):** every deploy produces a maker-facing security + privacy report. **Definition of done (Stage B):** marketplace listing shows kind badge + score + grade publicly with confidence the numbers are right.

## Phase 5 — Update safety layer

- App code version vs user data version are tracked separately
- Local schema version metadata stored in `_meta` table
- Additive migrations applied automatically (`ADD COLUMN`, `CREATE INDEX`)
- Destructive migrations blocked unless declared in `shippie.json` `migrations` block
- Bundle content origin tracking: `_origin: bundle | user`, `_userModified`, `_bundleVersion`
- Bundle content updates merge cleanly: new items inserted, unmodified items updated, user-modified items preserved with shadow of bundle version
- "Update card" UX: "3 new recipes added. Your 200 recipes are unchanged."

**Ethos check:** migration log lives in user's local DB only.

**Definition of done:** maker pushes v7 with new schema; user with v6 + 200 personal records lands cleanly with zero data loss.

## Phase 6 — Private analytics + feedback

### 6a. Analytics

- Daily rotating session hash: `sha256(deviceId + date + appSalt)`
- Aggregate counts only; parameterized routes never raw URLs
- Action counts, performance metrics, retention cohorts (install-week)
- One beacon per day per app per device
- Hard rule: zero personal content in any beacon (CI test enforces)

### 6b. Feedback

- Anonymous by default, identity optional
- Auto-attached context: app version, route, device class, session depth
- Maker reply via platform relay; queued offline on user side
- Thread persists locally on user device + on maker inbox
- Dimensional ratings (easy / useful / fast / beautiful) replacing stars

### 6c. Whispers

- Maker messages bundled with app updates
- Show-once with optional route action
- Reply creates a feedback thread

**Privacy enforcement (mechanism):**
- **Schema allowlist.** Every analytics beacon and feedback payload conforms to a strict schema. Fields not in the allowlist are dropped at serialization time, not at send time. The schema is the contract.
- **Fixture tests.** A test corpus of representative beacons and feedback payloads is serialized through the real codec on every CI run; assertions verify forbidden fields (raw URL params, search queries, content text, persistent device IDs) cannot appear in the output regardless of input shape.
- Grep is a useful smoke check on top of these but is not the enforcement mechanism — it misses structured leaks and creates noisy false positives.

**Ethos check:** no event carries personal content. Enforced by schema + fixtures, not by linting.

**Definition of done:** maker sees usable product intelligence dashboard; user identity is unrecoverable from any beacon; schema + fixture tests pass on every CI run.

## Phase 7 — MCP + CLI shared core expansion

Same core, two interfaces. Move logic out of route handlers into a reusable package.

- **`packages/shippie-core/`** owns: deploy, apps list, logs, config, classify, localize plan, workspaces, templates
- **MCP** = thin wrapper exposing core as Claude Code tools
- **CLI** = thin wrapper exposing core as terminal commands
- **`shippie deploy --target hub.local`** — deploy directly to a Hub over the local network, no internet

**Ethos check:** same binary works against `shippie.app` and `hub.local` with one flag.

**Definition of done:** all routine maker actions available from MCP, CLI, and dashboard with feature parity.

## Phase 8 — Localize V1

Source migrations, not runtime shims.

**Supported:**
- Supabase client basic CRUD (`from().select/insert/update/delete`) → `shippie.local.db.*`
- Supabase Storage (`storage.from().upload/getPublicUrl`) → `shippie.local.files.*`
- Auth.js / NextAuth simple session → Local Identity
- Firebase Firestore basic CRUD (after Supabase ships)

**Hard refuse (clear message, no transformation):**
- RLS policies (require server)
- RPC / database functions
- Realtime subscriptions (use Shippie groups instead)
- Edge functions / serverless
- Server-side Supabase clients
- Payments / inventory
- Global multiplayer state

**Flow:** "We can help make this local. Here's the diff. Review and apply." Maker sees every line that will change before anything is changed.

**Ethos check:** every transformation produces a reviewable diff before applying.

**Definition of done:** representative Supabase recipe app deploys via Localize V1, runs fully offline with the maker's existing UI intact.

## Phase 9 — Marketplace-as-PWA + Hub-as-local-Shippie

The ethos move. Two halves.

### 9a. Marketplace as a PWA

- `shippie.app/marketplace` is itself an installable PWA
- Caches the app directory locally (5–10MB for ~1000 apps)
- Pull-to-refresh syncs new apps when online
- Install action falls through: download from CDN | nearest Hub | nearby phone (Spark)

### 9b. Hub as local Shippie node — narrow MVP

Per Decisions, the Hub MVP is deliberately narrow. Full self-hosted Shippie is a later milestone.

- App cache (apps and assets served locally on the venue network)
- Local deploy target (`shippie deploy --target hub.local`)
- Local marketplace subset (mirror of approved app metadata; not the full directory)
- Local analytics aggregation (beacons collected locally; maker views via Hub dashboard)
- SignalRoom / mesh coordinator (already designed)

**Ethos check:** a school/pub/venue can run their day-to-day deploy + serve loop without talking to `shippie.app`.

**Definition of done (Phase 9b — Hub MVP):** `docker compose up` on a Raspberry Pi runs the five MVP capabilities above. A maker can deploy to that Hub from CLI and users on the local network can install and run the app without internet.

### 9c. Full self-hosted Shippie — pre-federation milestone (deferred)

Promotion to a fully-functional private Shippie instance (full marketplace, feedback inbox UI parity, identity primitives, complete dashboard) follows once Hub MVP proves itself in real venues. Tracked separately, not part of Phase 9 exit.

## Phase 10 (long arc) — Federation

Self-hosted Shippie instances interoperate. Like email: one protocol, many servers.

- Discovery protocol: a private Hub can pull approved apps from `shippie.app`
- Sharing protocol: a company Hub can share apps with partner Hubs
- No central authority required; Shippie's hosted instance is one node

**Decision deferred to Year 2–3.** Don't pre-build. Make sure earlier phases don't preclude.

## Cross-cutting principles

1. **Plan-from-HEAD.** Every claim about code state is verified against the HEAD file before being acted on.
2. **Ethos audit per phase.** Each phase has an explicit "does this preserve the path to a Hub?" check.
3. **Artifacts over DB rows.** Wherever feasible, generate portable static artifacts (JSON, NDJSON, manifests) that a Hub can serve without our platform.
4. **Same code, two targets.** The CLI and MCP must work identically against `shippie.app` and `hub.local`. This forces good abstraction.
5. **No data exfiltration.** Every analytics/feedback path serializes through a schema allowlist, with fixture tests proving personal-content fields cannot appear in emitted payloads.

## Strategic addendum — container commons

The container commons track is an overlay on this master plan, not a replacement for it.

- ADR: `docs/superpowers/adrs/006-container-commons-runtime.md`
- Spec: `docs/superpowers/specs/2026-04-27-container-commons-package-runtime.md`
- Plan: `docs/superpowers/plans/2026-04-27-container-commons-implementation.md`

Governing principle:

> **Container-first experience. URL-first ownership. Package-first portability.**

The existing phases still own the foundation: real SDK runtime, Deploy Truth, proof, security/privacy reports, update safety, analytics/feedback, Localize, and Hub. The container commons track consumes those outputs to create the installed Shippie app, portable `.shippie` packages, app receipts, version lineage, custom-domain ownership, fork/remix provenance, and Hub-installable packages.

## What this plan does NOT do

- Does not pre-build the gossip relay or mesh-as-internet vision (Year 5+ territory)
- Does not require the Shippie Seal scoring weights to be perfect at launch — adjust as proof events accumulate
- Does not promise runtime shims for cloud apps (only reviewable source migrations)
- Does not federate with other platforms or open the protocol — Phase 10 deliberately deferred

## Decisions

Confirmed 2026-04-27.

1. **Wrapper SDK upload** — bundled into platform `wrangler deploy` for now. Move to versioned R2 (`sdk/v1.0.3.js` + `latest` pointer + rollback) once release discipline exists.
2. **MCP distribution** — ship `npx @shippie/mcp` first. Bundle with CLI long-term.
3. **Trust card** — first launch only, plus re-show on **major trust posture changes**: kind transitions (Local → Connected), new external domain, new feedback/analytics behavior, security score drop.
4. **Phase 7 vs 8** — ship MCP/CLI shared core first. Localize V1 then ships on top of the proven core.
5. **Hub MVP scope** — start narrow:
   - app cache
   - local deploy target
   - local marketplace subset
   - local analytics aggregation
   - SignalRoom / mesh coordinator
   
   Full self-hosted Shippie waits until this proves useful.
