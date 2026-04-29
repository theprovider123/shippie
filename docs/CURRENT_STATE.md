# Shippie — Current State

> Living truth file. If a doc, plan, or memory disagrees with this, **trust this file**. Re-verify against HEAD before encoding any new claims into a plan.
>
> **Last updated:** 2026-04-29 (evening — improvement plan rev2 P1–P6 complete)
> **Recent HEAD anchor:** `5905702` (P6D catalogue refresh) — sits on top of the P1–P5 stack documented at the bottom of this file.

This file replaces stale assumptions about Shippie's architecture. Read it before planning anything.

---

## 2026-04-29 night — Open / Open-with-Shippie unification shipped

After the rev2 P1–P6 stack landed, the marketplace had two confusing buttons per app — "Open" → standalone wrapper (no cross-app features), "Open in Shippie" → container shell (all features). The unification plan (`/Users/devante/.claude/plans/jaunty-coalescing-pancake.md`) collapsed this into one experience: every app opens through a container shell that's invisible by default. Cross-app features always work; the user perceives "I'm in Recipe Saver", not "I'm in Shippie viewing Recipe Saver".

**What landed:**

- **A1.5 deep container split** — extracted `IntentPromptModal`, `TransferPromptModal`, `AppFrameHost`, `DashboardHome` from `/container/+page.svelte`. Reduced 2,188 → 1,983 lines. The TransferPromptModal also fixes a P1A.3 bug where transfer-drop prompts queued silently.
- **AppSwitcherGesture component + `/dev/gesture-prototype` route** — edge-swipe + bottom-pill + Escape triggers, 200ms spring with 1.03 overshoot, app dim-and-scale during drawer-open, prefers-reduced-motion respected. Tuning constants exposed at the top of the component for real-phone polish on iOS Safari + Android Chrome.
- **Marketplace one-button collapse** — `/apps/<slug>` now shows one `[Open <Name>]` CTA. New `lib/showcase-slugs.ts` module owns `FIRST_PARTY_SHOWCASE_SLUGS` + `canonicalAppUrl(slug)`.
- **`/run/[slug]/` route + focused-mode rendering** — `/run/<slug>/` 302s to `/container?app=<slug>&focused=1`. The container's `+page.svelte` reads `focused=1` and strips sidebar / topbar / section tabs — full-bleed iframe via AppFrameHost + AppSwitcherGesture overlay for switching. Bridge handlers, intent / transfer registry, mesh client, texture engine, AI worker, agent insights all stay wired. Focused mode is a presentation branch, not a behaviour branch.

**End-to-end flow:**

```
/apps/<slug>  →  [Open <Name>]  →  /run/<slug>/
                                   ↓ 302
                      /container?app=<slug>&focused=1
                                   ↓
            full-bleed app + invisible chrome + swipe-from-left
              for instant in-window switching to other apps
```

Install model is **one Shippie PWA** — apex `/manifest.webmanifest` is the manifest, all apps live inside. No per-app PWAs. Cross-app intents flow via iframe fanout in the single window (no BroadcastChannel needed).

**Outstanding from the unification plan (not blocking ship):**

- PWA manifest tightening — per-app `/__shippie/manifest` for first-party showcases could 302 to apex.
- Apex `/` becomes container home — polish; focused-mode works without it.
- Iframe LRU eviction — performance cap on simultaneously-mounted apps.
- Real-phone gesture tuning — `/dev/gesture-prototype` is the ground.

---

## 2026-04-29 evening status — improvement-plan rev2 P1–P6 shipped

The `docs/launch/2026-04-29-improvement-plan.md` rev2 is now code-complete for phases P1 through P6 (P7 is explicitly USER-SIDE: real-phone smoke + Cloudflare deploy). The plan landed in 26 commits on top of the rev2 doc.

**What's new at HEAD that this file's older sections don't yet describe:**

- **3 new bridge capabilities** in `packages/app-package-contract` — `apps.list` (overlap-only scoping), `agent.insights` (source-data invariant via `provenance: string[]` on every Insight), `data.transferDrop` (per-(source,target) grant flow). All gated through the existing capability bridge.
- **AI worker hardening** — q8 quantized models by default in `@shippie/local-ai`, plus a 225 MB LRU cache budget (`apps/platform/src/lib/container/ai-cache-budget.ts`) with full Cache Storage eviction.
- **CORS proxy** at `/__shippie/proxy?url=...` with full SSRF guards: RFC1918 + AWS metadata + IPv6 ULA/link-local + DoH-driven DNS rebind protection + redirect re-validation + 5 MB stream cap + Set-Cookie strip + per-session quota. Read-Later showcase consumes it.
- **HRM GATT helper** in `@shippie/proximity` — `pairHrm()` returns a `ReadableStream<HeartRateSample>`; gated behind `detectBleAvailability()` so iOS Safari sees an explanatory message instead of a stack trace.
- **`bun run new:showcase <slug>` scaffold** — generates a working showcase from `templates/showcase-template/` with port allocation, curated-app entry, FIRST_PARTY_SHOWCASE_SLUGS update, and a fresh seed migration. Used to spin up all 11 P4 apps.
- **22 showcase apps** wired into the cross-app intent graph (was 11). New apps: `caffeine-log`, `hydration`, `mood-pulse`, `symptom-tracker`, `steps-counter`, `pomodoro`, `read-later`, `daily-briefing`, `restaurant-memory`, `show-and-tell`. The 11 originals each got a P3 pass A (textures, intent wiring, mesh, photo time-lapse, latency overlay, etc).
- **`@shippie/micro-logger` package** — config-driven single-tap logger template that powers the 5 P4A showcases as ~20-line config files.
- **`shippie.ai.run`** added to the iframe-SDK; first integrations live in Journal (sentiment sparkline), Pantry Scanner (photo classify), Shopping List (aisle classifier). All gate on `source !== 'unavailable'` and hide cleanly when the AI worker can't serve the task.
- **Intent graph integrity test** at `apps/platform/src/lib/container/intent-graph.test.ts` — single suite asserts every consumer has a producer, every provider has a consumer (or is on the orphan list), heavy-hitters have ≥2 consumers, the cross-cluster acceptance pair resolves.
- **Showcase catalogue at `@shippie/templates`** updated to all 18 launch entries across food / health / productivity / memory clusters; cross-cluster acceptance test asserts the count + intent-completeness invariants.

**Health gate** (composite of `bun run typecheck && test && build`): **48/48 tasks pass** at HEAD (was 37 at rev2 baseline).

**Cross-app intent graph at HEAD** — 16 distinct intents flow across 22 apps:

```
cooked-meal       (recipe-saver)        → habit-tracker, meal-planner, journal,
                                          restaurant-memory, daily-briefing, hydration
cooking-now       (recipe-saver)
shopping-list     (recipe-saver, meal-planner) → shopping-list, meal-planner
pantry-inventory  (pantry-scanner)      → recipe-saver, meal-planner
pantry-low        (pantry-scanner)      → shopping-list
needs-restocking  (shopping-list)
workout-completed (workout-logger)      → habit-tracker, sleep-logger,
                                          journal, daily-briefing, mood-pulse,
                                          steps-counter
sleep-logged      (sleep-logger)        → workout-logger, mood-pulse, daily-briefing
caffeine-logged   (caffeine-log)        → mood-pulse, sleep-logger, daily-briefing
mood-logged       (mood-pulse)          → daily-briefing, read-later
hydration-logged  (hydration)           → daily-briefing
body-metrics-logged (body-metrics)      → journal, daily-briefing
symptom-logged    (symptom-tracker)     → daily-briefing
walked            (steps-counter)
focus-session     (pomodoro)            → daily-briefing
dined-out         (restaurant-memory)
```

Plus the data-transferDrop pair: Recipe Saver `recipe` → Meal Planner.

**What remains** (none of it code):
- **P6B** — re-record the cross-cluster demo with the full 22-app surface. Existing `tools/recording/cross-cluster.smoke.ts` gates the flow; a fresh recording is a manual run against a live dev server.
- **P7** — walk `docs/launch/cf-google-deploy.md` on a real CF account; walk `docs/launch/real-phone-checklist.md` on iPhone Safari + Android Chrome.

---

## What Shippie is

Shippie is a post-cloud app platform. The public story is **Wrap. Run. Connect.**

- **Wrap** — deploy any web app, Shippie makes it installable, offline-capable, faster, more tactile.
- **Run** — everything runs on the user's device: local DB, files, AI, intelligence, backup, data ownership.
- **Connect** — nearby devices talk directly via real-time rooms, peer-to-peer sync, offline propagation.

Internally, the platform is composed of nine engineering components: **Shell, Boost, Sense, Core, AI, Vault, Pulse, Spark, Hub.** Do not expose all nine externally — they are docs / SDK architecture detail.

For the full vision, phased plan, and Non-Negotiables, see `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`.

---

## Architecture (HEAD reality)

The SvelteKit + Cloudflare cutover shipped on 2026-04-26 (commit `56179bf`).

- `apps/platform/` — SvelteKit + Cloudflare Workers + D1 / R2 / KV / Durable Objects. The blessed platform app. Dev port **4101**.
- `apps/shippie-ai/` — Cross-origin AI iframe (Vite + vite-plugin-pwa). Runs micro-models via Workbox-cached Service Worker.
- `apps/showcase-*/` — 22 demo apps (post-rev2-P4) proving wrapper + cross-app intent + AI + mesh flows end-to-end. Originals on dev ports 5180–5190; P4 additions on 5191–5200. Full enumeration: recipe (5180), journal (5181), whiteboard (5182), live-room (5183), habit-tracker (5184), workout-logger (5185), pantry-scanner (5186), meal-planner (5187), shopping-list (5188), sleep-logger (5189), body-metrics (5190), caffeine-log (5191), hydration (5192), mood-pulse (5193), symptom-tracker (5194), steps-counter (5195), pomodoro (5196), read-later (5197), daily-briefing (5198), restaurant-memory (5199), show-and-tell (5200).
- `services/hub/` — Self-hosted venue device (Bun server, mDNS, WebSocket signal). Active.
- `services/worker/` — **DELETED.** Functionality ported into `apps/platform/src/lib/server/wrapper/`.
- `apps/web/` — **DELETED.** Was the legacy Next.js platform.
- `packages/cf-storage/` — **DELETED.** Replaced by native `event.platform.env.*` Cloudflare bindings.
- `vercel.json` — **DELETED.** Stack is Cloudflare-only.

### Workspace packages (verified at HEAD)

- `packages/sdk` — `@shippie/sdk` v2. Client SDK (auth, storage, files, feedback, analytics, install, native bridge, lazy-loaded local groups via proximity). Subpath exports: `./native`, `./wrapper`.
- `packages/pwa-injector` — Manifest + Service Worker generation.
- `packages/local-db` — wa-sqlite + IndexedDB fallback.
- `packages/local-files` — OPFS path abstraction.
- `packages/local-ai` — LocalAI bridge spec; iframe lives at `apps/shippie-ai`.
- `packages/local-runtime` — DB + telemetry orchestration.
- `packages/local-runtime-contract` — Shared local-runtime types.
- `packages/ambient` — Background analysis scheduler + insight surfacing.
- `packages/intelligence` — Spatial memory, pattern tracking, predictive preload, temporal context, recall.
- `packages/proximity` — Rooms, WebRTC, gossip, transfer primitives.
- `packages/backup-providers` — Encrypted backup adapters (iCloud, Google Drive, Dropbox).
- `packages/session-crypto` — Encryption helpers.
- `packages/analyse` — HTML/CSS/JS scanner → AppProfile → enhance rule compilation.
- `packages/access` — OAuth + OIDC adapters.
- `packages/shared` — Shared project types.
- `packages/cli` — `shippie deploy ./dist`.
- `packages/mcp-server` — Claude Code MCP server.
- `packages/db` — Drizzle schema + D1 migrations.
- `packages/dev-storage` — Local dev IndexedDB / KV simulator.
- `packages/agent` — Local cross-app agent (Phase C1). Three strategies (meal-planning, schedule-awareness, budget-awareness) + runner with urgency sort + cap + dismiss-aware dedupe + in-memory rate limiter. Pure functions; no I/O.
- `packages/templates` — Showcase catalog (Phase C2). 8-entry registry mapping each showcase app to its proven capability and intent topology, plus the `crossClusterAcceptancePair` constant.
- `packages/container-bridge` — postMessage host/client + capability enforcement (codex's surface — extended in this session for `system.*`, `data.openPanel`, `feel.texture`, `intent.*` broadcast).
- `packages/app-package-contract` — Manifest types + validators (extended for system-tier perms + intent capabilities).
- `packages/app-package-builder` — `.shippie` archive builder.

`tools/` is now also a workspace folder:

- `tools/recording` — Playwright walkthrough that records the cross-cluster demo to `docs/launch/recordings/c2-cross-cluster.webm`.

---

## Current Component Status

Tier ladder: **Foundation built → Demo-ready → Launch-ready → Partial → Not built.**

| Internal component | Layer | Status | Notes |
|--------------------|-------|--------|-------|
| Shell | Wrap | Foundation built | Wrapper primitives at `packages/pwa-injector/`, `packages/sdk/src/wrapper/install-prompt.ts`, `packages/sdk/src/wrapper/push.ts`. Launch readiness depends on real-device install / offline proof on iOS Safari + Android Chrome. |
| Boost | Wrap | Foundation built | DOM observer + capability gate + rules engine at `packages/sdk/src/wrapper/observe/`, `packages/analyse/`, `packages/sdk/src/wrapper/rules/`. AppProfile auto-detection (Plan B) not yet shipped. |
| Sense | Wrap | Foundation built | Full feel layer at `packages/sdk/src/wrapper/{haptics,spring,gestures,view-transitions,theme-color,textures,patina,your-data-panel,group-moderation-panel,insight-card}`. Demo-ready depends on showcase apps proving textures and patina in real use. |
| Core | Run | Foundation built | Local DB / files / runtime primitives at `packages/local-db/`, `packages/local-files/`, `packages/sdk/src/local.ts`, `packages/intelligence/`, `packages/local-runtime/`. Launch readiness depends on real-device proof, migration handling, quota behaviour, and recovery flows. |
| AI | Run | Partial | `apps/shippie-ai/` runs 5 inference tasks via postMessage. WebNN three-tier (NPU → GPU → WASM) detection wired and `source` field threaded through inference responses + SDK `LocalAI` wrapper; AI dashboard UI surfacing backend choice still pending. |
| Vault | Run | Partial | `packages/sdk/src/wrapper/your-data-panel.ts` + `packages/backup-providers/` exist. OAuth-to-user-cloud bridge route now wired at `apps/platform/src/routes/oauth/[provider]/+server.ts` (8/8 envelope round-trip + redirect tests). Device transfer flow primitives in `packages/proximity/src/transfer.ts`; UI integration with `your-data-panel` is the remaining gap. |
| Pulse | Connect | Foundation built | Proximity primitives + signalling at `packages/proximity/`, `services/hub/src/signal.ts`, D1 `room_audit` table. Platform-side `SignalRoom` DO + `/__shippie/signal/[roomId]` route now wired (`apps/platform/src/lib/server/proximity/signal-room.ts`, wrangler.toml v3 migration, wrap-worker bundles + re-exports the class, 9/9 routing tests). Live Room still needs real-device demo. |
| Spark | Connect | Not built | Roadmapped. No BLE beacon, no hotspot handoff, no chain propagation. |
| Hub | Connect | Partial | `services/hub/` runs mDNS + WS signalling and caches apps / models. Cloud bridge for offline-collected data and multi-Hub mesh not built. |

---

## Build / Typecheck / Test status (HEAD)

Captured 2026-04-26 after Phase 0 fixes.

### Typecheck — **PASS**

```
turbo run typecheck --force
Tasks:    26 successful, 26 total
```

All 26 packages typecheck cleanly. The earlier `apps/shippie-ai/src/sw.ts` TS2717 (Workbox `__WB_MANIFEST` type conflict) is fixed by removing the conflicting local `declare global` block — Workbox's own ambient declaration is now trusted.

### Build — **PASS**

```
turbo run build --force
Tasks:    24 successful, 24 total
```

The earlier `packages/local-db/src/wa-sqlite.d.ts` rollup-plugin-dts error ("namespace child (hoisting) not supported yet") is fixed by switching from `export default factory` (referencing a `const`) to `export default function factory()` — hoisting-safe.

### Test — **PASS**

```
turbo run test
Tasks:    31 successful, 31 total
```

`@shippie/platform`: **33 test files, 254 tests passing, 0 failing.** (+6 files, +48 tests over the session — OAuth coordinator route, SignalRoom DO routing, OAuth start route, capability-badges derivation, proof ingestion validation, proven-badge merging.)

`@shippie/sdk`: **+10 tests** (wrapper proof emitter — queue, batching, dedup, 4xx-drop, 5xx-retry, network-error retry, device hash stability).

`@shippie/proximity`: **+8 tests** (transfer-group-adapter — selfId pass-through, broadcastBinary routing, onBinary type filtering + ArrayBuffer upgrade, awaitPeer present/polling/timeout, destroy).

The earlier 13-suite failure (`Failed to load url bun:test`) is fixed by migrating those test files from Bun's `bun:test` runner to Vitest (the platform's actual test runner per its `package.json` script: `"test": "vitest run"`). The migration was:

- 12 files: changed `from 'bun:test'` to `from 'vitest'` — APIs (`describe`, `it`, `expect`, `beforeEach`, `afterEach`) are 1:1 compatible.
- 2 files (`src/routes/admin/page.server.test.ts` + `src/routes/admin/audit/page.server.test.ts`): also replaced Bun's `mock.module(specifier, factory)` with Vitest's `vi.mock(specifier, factory)`. Vitest hoists `vi.mock` calls automatically, matching `mock.module` semantics.

Note: Vitest emits `close timed out after 10000ms — Tests closed successfully but something prevents Vite server from exiting` after a green run. Tests pass; only the Vite dev-server cleanup hangs. Tracked separately, not a blocker.

### Health (composite) — **PASS** (2026-04-29)

The root `bun run health` script runs typecheck + test + build in sequence. Latest:

```
$ bun run health
# turbo run typecheck:  40/40 ✓
# turbo run test:       50/50 ✓
# turbo run build:      36/36 ✓
```

Counts grew: +14 typecheck / +19 test / +12 build vs the 2026-04-26 baseline because Phase A+B+C added `@shippie/agent`, `@shippie/templates`, `@shippie/recording`, plus 7 new `apps/showcase-*` workspaces.

Green = baseline acceptable.

---

## Shipped state (2026-04-29 session)

Phase A1–A5 + B1–B4 + C1 + C2 + Phase 6 + production hosting are all on `origin/main`. Live in production at `https://shippie.app`. Latest commit: `be7223d`.

### Live URL pattern

| URL | Status |
|---|---|
| `https://shippie.app/` | apex marketplace |
| `https://shippie.app/container` | container shell |
| `https://shippie.app/run/<slug>/` | showcase runtime — what the container iframe loads |
| `https://<slug>.shippie.app/` | 302 → `/run/<slug>/` |

Showcase URLs in production (all 11 verified 200):

```
shippie.app/run/recipe          shippie.app/run/journal
shippie.app/run/whiteboard      shippie.app/run/habit-tracker
shippie.app/run/workout-logger  shippie.app/run/pantry-scanner
shippie.app/run/meal-planner    shippie.app/run/shopping-list
shippie.app/run/sleep-logger    shippie.app/run/body-metrics
shippie.app/run/live-room
```

### Why `/run/` (not bare subdomains)

Three options were considered (per-app CF Pages projects, separate static-only Worker, or `/run/` namespace). Chose option 3 — `/run/<slug>/` — because:

- Single deploy, single Worker, single bindings
- Same-origin → container iframe + bridge calls without cross-origin cost
- Showcases are first-party demos of the container, not standalone-shipped apps. The runtime URL is implementation detail; the user sees the container.
- Trivial to add a showcase: drop into `apps/showcase-X/`, prepare script picks it up, deploy.

If a showcase ever needs to graduate to its own subdomain origin (own SW scope, own storage), that's a one-time migration to a CF Pages project — defer until demand asks for it.

Per-track summary:

- **A1** Container shell split — `apps/platform/src/routes/container/+page.svelte` 1389→969 lines, extracted into 9 modules under `apps/platform/src/lib/container/`.
- **A2** Cross-app intents — `intent.provide` / `intent.consume` capabilities + registry + manifest parser + permission UI.
- **A3** System-tier perms — `system.crossDb.query` / `system.notify` / `system.openApp`; iframe apps cannot escalate; `assertValidPermissions` rejects published manifests with `system_permission_forbidden`.
- **A4** AppProfile zero-config — meta-description + manifest scanner gap-fix in `packages/analyse/`.
- **A5** Your Data bridge — `data.openPanel` universal capability + container host wiring + topbar banner.
- **B1** AI worker + WebNN — `selectAiBackend()` (WebNN→WebGPU→WASM), `ai-worker-client.ts` real client + memory transport, `ai-worker.ts` entry that dynamic-imports `@shippie/local-ai` (Transformers.js adapter) on first call.
- **B2** Mesh-status badge — pure store + topbar badge + Discover-page Nearby panel (create/join/leave room).
- **B3** Stage B harness — D1 migration `0008_deploy_scan_outcomes.sql`, schema, `recordScanOutcome` upsert, `aggregateFalsePositiveRate` aggregator, `promotionReady` gate, hidden `/trust-preview` admin route.
- **B4** Texture bridge — `feel.texture` capability + 9-preset router + dynamic-imported `@shippie/sdk/wrapper`.
- **C1** Local agent v1 — `packages/agent` (3 strategies + runner + rate-limiter + 30 tests), `_shippie_agent_audit` migration, `InsightStrip.svelte` with high/medium/low urgency tiers + 7-day dismiss persistence.
- **C2** Showcase library — `packages/templates` catalog, 7 new React showcase apps, cross-cluster acceptance test, `intent.provide` broadcast forwarding through the bridge so granted consumer iframes receive provider rows in real time, `docs/launch/c2-demo-storyboard.md` brief, `docs/launch/recordings/c2-cross-cluster.webm` rough cut.

### Container app port map (dev only — `devUrl` field)

| Slug | Port |
|---|---|
| platform shell | 4101 |
| recipe-saver | 5180 |
| journal | 5181 |
| whiteboard | 5182 |
| habit-tracker | 5184 |
| workout-logger | 5185 |
| pantry-scanner | 5186 |
| meal-planner | 5187 |
| shopping-list | 5188 |
| sleep-logger | 5189 |
| body-metrics | 5190 |

`bun run dev:apps` brings up all 11 ports in parallel (uses `--concurrency=20 --filter='./apps/*'` to avoid turbo's default 10-task cap).

### To re-record the demo

```bash
# terminal 1
bun run dev:apps
# terminal 2 (after ~15s)
bun run record:demo
```

Output: `docs/launch/recordings/c2-cross-cluster.webm`.

---

## What's been wired since session start (2026-04-26 day-2 build)

Layered on top of Phase 0:

- **Runtime proof spine end-to-end** — schema (`proof_events` + `capability_badges`), D1 migration `0004_proof_events.sql`, 15-event taxonomy, `POST /api/v1/proof` ingestion (taxonomy-gated, KV-rate-limited), daily `capability-badges` cron (deriveBadges, awards on ≥3 distinct devices, revokes on regression), maker dashboard `/dashboard/apps/[slug]/proof`. Wrapper proof emitter at `packages/sdk/src/wrapper/proof.ts` queues events in IndexedDB (in-memory fallback in tests), flushes every 30s + on `visibilitychange`, dedupes within session, retries on 5xx + network errors, drops on 4xx, auto-emits `installed` + `service_worker_active`. Public surface: `configureProof`, `emitProofEvent`, `flushProofQueue`.
- **Capability Proof Badges on listings AND marketplace grid** — listing page reads `capability_badges`; homepage `+page.server.ts` and `/apps/+page.server.ts` join `capability_badges` for visible apps and pass proven badges through `AppGrid` → `AppCard` → `CapabilityBadges` (filled sage pill + ✓ for proven, outline for build-time-detected). `provenBadgesFromAwards` and `publicCapabilityBadgesWithProven` in `lib/server/marketplace/capability-badges.ts`.
- **OAuth coordinator end-to-end** — `apps/platform/src/routes/oauth/[provider]/+server.ts` (envelope verify → 302 to provider authorize → callback verify → token exchange → postMessage `{ kind: 'shippie-oauth', ok, token }` to maker's signed origin), plus `__shippie/oauth/start/+server.ts` so maker apps don't need the coordinator secret.
- **Concrete `createTransferRoom` / `joinTransferRoom`** — `packages/proximity/src/transfer-group-adapter.ts` adapts a regular Proximity `Group` into the binary-only `TransferGroupHandle` `transfer.ts` expects. Re-exported from `@shippie/proximity`. Your Data panel default falls through to the adapter so makers don't have to inject `transferApi`.
- **SignalRoom Durable Object** — `apps/platform/src/lib/server/proximity/signal-room.ts` + `/__shippie/signal/[roomId]` route + wrangler.toml v3 migration with `new_sqlite_classes` + wrap-worker bundles + re-exports the class.
- **Homepage hero + three-pillar copy** — `apps/platform/src/routes/+page.svelte` aligned with Wrap/Run/Connect framing.
- **`/new` onboarding polish** — five deploy paths (zip / wrap / CLI / MCP / GitHub) with time-to-URL chips + "What happens after deploy" panel.
- **Architecture docs** — `docs/architecture.svg` (container-first / URL-first / package-first diagram) referenced from `docs/architecture.md`. `docs/WHITEPAPER.md` draft v1. `docs/launch/real-phone-checklist.md` + `docs/launch/cf-google-deploy.md` for user-driven launch work.

## Known live bugs / brittleness fixed in Phase 0

| Issue | Location | Fix |
|-------|----------|-----|
| TS2717 — `__WB_MANIFEST` type conflict | `apps/shippie-ai/src/sw.ts` | Removed local `declare global` block; trust Workbox's own ambient declaration. |
| rollup-plugin-dts namespace hoisting failure | `packages/local-db/src/wa-sqlite.d.ts` | Switched `export default factory;` (referencing a `const`) to `export default function factory()`. |
| Race: `sdk` typecheck loses `proximity` types when build cleans dist concurrently | `packages/proximity/package.json` | Switched `exports` from `./dist/*` to `./src/index.ts` — workspace consumers now read source. Matches the pattern already used by `local-db`, `ambient`, `backup-providers`, `intelligence`. |
| 14 platform test suites fail to load with `Failed to load url bun:test` | `apps/platform/src/{routes,lib/server,scripts}/**/*.test.ts` | Migrated all 14 from `bun:test` to `vitest` (the platform's actual runner). Two files using `mock.module` switched to `vi.mock`. |

---

## False alarm bugs (do not re-verify, do not fix)

These were reported in earlier code review but are wrong at HEAD:

- ❌ `manifest.ts:84` references undefined `deriveShortName`. **FALSE** — defined at `apps/platform/src/lib/server/wrapper/router/manifest.ts:126`.
- ❌ `files.ts` SPA fallback fails with `ERR_STREAM_CANNOT_PIPE`. **FALSE** — body is read once via `arrayBuffer()` at `apps/platform/src/lib/server/wrapper/router/files.ts:71`; HTML and binary paths use independent streams.
- ❌ `access-gate.test.ts:79` private invite cookie returns 401. **FALSE** — test passes; assertion is `expect(res).toBeNull()` and `verifyInviteGrant` allows correctly.
- ❌ `cron/dispatch.test.ts:36` `vi.mocked` not in Bun. **FALSE** — `apps/platform` uses Vitest, so the import is correct.

---

## App Kinds vocabulary (2026-04-26)

Shippie classifies every app as **Local**, **Connected**, or **Cloud** —
the user-facing answer to "does this work offline, and where does my data
live?" Definitions, profile shape, and proof rules live in
[`docs/app-kinds.md`](./app-kinds.md). Public truth is the platform's
*detected* kind plus a confidence status (`estimated` / `verifying` /
`confirmed` / `disputed`); maker declaration is input, never the public
label. The rollout (Phases 0a, 0b, 1) is planned in
[`docs/superpowers/plans/2026-04-26-app-kinds-rollout.md`](./superpowers/plans/2026-04-26-app-kinds-rollout.md).

---

## Active roadmap

The active build roadmap lives at `docs/superpowers/plans/2026-04-25-intelligence-layer-roadmap.md`. The decomposed plans are:

- Plan A — WebNN hardware acceleration (`2026-04-26-webnn-hardware-acceleration.md`)
- Plan B — Zero-config pipeline + WASM auto-detect (`2026-04-26-zero-config-pipeline-and-wasm.md`)
- Plan C — Sensory textures + patina (`2026-04-26-sensory-textures-and-patina.md`)
- Plan D1 — Adaptive intelligence core (`2026-04-26-adaptive-intelligence-d1-core.md`)
- Plan D2 — Adaptive intelligence experimental (`2026-04-26-adaptive-intelligence-d2-experimental.md`)
- Plan E — Ambient intelligence (`2026-04-26-ambient-intelligence-e.md`) — **shipped**
- Plan F — Cross-app intents + knowledge graph (`2026-04-26-cross-app-intents-and-knowledge-graph-f.md`) — deferred to demand-pulled
- Plan G — Maker dashboard + compliance (`2026-04-26-maker-dashboard-and-compliance.md`)
- Live Room showcase (`2026-04-26-live-room-showcase.md`)
- Production deploy runbook (`2026-04-26-prod-deploy-runbook.md`) — partially stale; see notes in that file

The umbrella plan (Wrap / Run / Connect, the six phases, Non-Negotiables, the Proof spine) lives at `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`.

---

## Stale docs that should NOT be trusted

These reflect pre-cutover architecture and have not yet been rewritten:

- `docs/architecture.md` — references `apps/web/`, `services/worker/`, Postgres+Drizzle, Supabase BYO. All wrong post-cutover.
- `docs/self-hosting.md` — references docker-compose with Postgres 16, Next.js env vars (NEXTAUTH_*, DATABASE_URL=postgres). All wrong post-cutover.
- `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md` — Steps 1–4 reference deleted `services/worker` and `apps/web`. Step 5 (`apps/shippie-ai` deploy) is still accurate. Use with caution.
- `docs/shippie-refactoring-plan-v5.md` — historical refactor plan; predates cutover.
- All `docs/superpowers/plans/2026-04-2{1,2,3,4}-*.md` — historical phase plans. Treat as archived.

These will be rewritten or marked archived as part of Phase 0 task #6.
