# Session Handoff — Intelligence Layer → SvelteKit Refactor

**From:** the "Intelligence Layer & Zero-Config Magic" session (Claude, 2026-04-26).
**To:** the SvelteKit + D1 refactor session (the one driving `apps/platform/`).
**Branch:** `main`. Latest commit: `04bd0af`. Pushed to origin.

---

## 🚨 Production incident I caused — read first

**At 2026-04-26 10:25 UTC** I deployed `services/worker/` as Worker `shippie-platform` from this session. That overwrote your live SvelteKit deploy at the same Worker name.

Current state:
- `https://shippie.app/` returns **522** — apex is down. The services/worker code I deployed only routes `*.shippie.app/*` and `cdn.shippie.app/*`, not the apex.
- `https://recipe.shippie.app/` etc. respond from MY services/worker code, NOT from the SvelteKit code that was there before.
- DNS hasn't changed — this is a Worker-level overwrite. Cloudflare's Workers history at https://dash.cloudflare.com/ shows the deploy chain.

**Cause.** I renamed `services/worker/wrangler.toml`'s `name` from `shippie-worker` → `shippie-platform` to "take over" routes claimed by an existing worker (which I didn't realize was your SvelteKit cutover). Both wrangler configs now target the same Worker name; my `wrangler deploy` won the most-recent-upload race.

**Fix paths (you choose; I left both un-run because each needs explicit auth):**

```bash
# Option A — fastest, restores prior version
cd services/worker && bunx wrangler rollback --message "restore SvelteKit"

# Option B — re-deploy from apps/platform/ (clean current pointer)
cd apps/platform && bun install && bun run build && bunx wrangler deploy
```

**After restoration, please also:**
1. Revert `services/worker/wrangler.toml` `name` back to `shippie-worker` (or delete the file entirely — your refactor plan retires `services/worker/` at Phase 5/6).
2. Investigate whether the route reassignment from `shippie-platform`-as-SvelteKit to `shippie-platform`-as-services-worker also dropped the apex `shippie.app/*` route binding. If so, re-claim it on the SvelteKit deploy.
3. Verify Cloudflare hasn't deactivated any of the SvelteKit Worker's secrets when my deploy uploaded (they shouldn't — secrets are separate from code — but worth a `wrangler secret list` check).

**Commit `04bd0af` is the bad one.** Roll forward with a corrective commit; don't try to revert (the wrangler.toml rename is now in main).

---

## Context: what's been happening in parallel

Two sessions were active concurrently today (2026-04-26):

- **Your session:** the **Cloudflare + SvelteKit + D1 architectural refactor** documented at `docs/superpowers/plans/2026-04-25-cf-sveltekit-refactor.md`. Apex cutover happened earlier than the plan called for; `apps/platform/` is the new home; cf-storage is being retired; Lucia replaces NextAuth.
- **My session:** the **Intelligence Layer & Zero-Config Magic** prompt — the third Shippie prompt, building on top of the existing `apps/web/` + `services/worker/` + `apps/shippie-ai/` stack.

Neither session knew the other was running until I noticed `apps/platform/` in the working tree. Until then I treated `services/worker/` as the live production worker (which was true historically — until your cutover).

---

## What this session shipped (all on `main`, all pushed)

### Plan A — WebNN hardware acceleration (`apps/shippie-ai/`)
- Three-tier backend selection NPU → GPU → WebGPU → WASM, cached at module scope.
- `source: Backend` field flows from model wrappers → router → SDK → dashboard.
- Dashboard renders "Running on …" pill + per-backend usage breakdown.
- 16 net-new tests; full plan: `docs/superpowers/plans/2026-04-26-webnn-hardware-acceleration.md`.

### Plan C — Sensory textures + digital patina (`packages/sdk/src/wrapper/textures/` + `patina/`)
- 9 preset textures (confirm/complete/error/navigate/delete/refresh/install/milestone/toggle).
- Procedural Web Audio synth (sound off by default).
- Observer rule auto-fires textures on click/submit/invalid/appinstalled/`[data-shippie-action="delete"]`.
- IndexedDB-backed page-level patina; body background warms 12–14% over a year via `color-mix(in oklab, ...)`.
- Recipe + Journal showcases opt into `--shippie-patina-warmth`.
- 28 net-new tests.

### Plan B — Zero-config pipeline + WASM (`packages/analyse/` new)
- HTML / CSS / JS / semantic-classifier / capability-recommender / WASM detector → produces `AppProfile`.
- `analyseApp(files): Promise<AppProfile>` runs in the deploy hot path, writes to KV at `apps:{slug}:profile`.
- PWA injector smart defaults (theme color from CSS, name from `<title>`, best icon source).
- Worker serves `.wasm` with `Content-Type: application/wasm` + COEP/COOP for SharedArrayBuffer.
- 70+ net-new tests.

### Plan G — Maker dashboard + compliance (`apps/web/app/dashboard/[appSlug]/enhancements/` + `app/professionals/`)
- Reads AppProfile from KV, renders auto-detected enhance rules + opt-in catalog + `shippie.json` editor.
- Compliance narrative page with three pricing tiers.
- 14 catalog tests.

### Plan D1 — Adaptive intelligence core (`packages/intelligence/` new)
- Pattern tracker, temporal context deriver, recall (semantic search via AI bridge embed).
- IndexedDB storage layer with pageviews/interactions/embeddings (LOG_CAP=10_000).
- Wrapper emits `shippie:pageview` on initial load + SPA navigations; intelligence subscribes via debounced event source.
- `shippie.local.intelligence.{patterns,temporalContext,recall}` exposed via lazy import in SDK.
- Showcase: Journal `/recall` page with 14-day semantic search.
- 52 tests.

### Plan E — Ambient intelligence (`packages/ambient/` new)
- Periodic Background Sync (Chrome) + `visibilitychange` fallback (Safari).
- Sync analysers: trend (week-over-week delta), anomaly (z-score).
- AI analysers: sentiment-trend (weekly slope), topic-cluster (greedy k=3 cosine).
- Orchestrator queues AI-requiring analysers when no open tab; drains on next app open.
- SW periodicsync handler emits sweep markers in `shippie-ambient-scheduler` IDB.
- Wrapper observe-init drains queue + renders insights via dismissible card on app open.
- Journal showcase: `bootAmbientForJournal()` wires sentiment-trend to entries collection.
- 67 tests.

### Plan D2 — Adaptive intelligence experimental
- Spatial fingerprinting: WiFi BSSID-derived SHA-256 (with mDNS skip) → geo fallback. Storage v1 → v2 schema upgrade adds `spaces` store.
- Predictive preload: picks next page from `frequentPaths`, appends `<link rel="prefetch">` when confidence ≥ 0.7.
- Opt-in via `shippie.json.intelligence.{spatial,predictivePreload}`.
- Dashboard catalog gains two entries.
- 21 tests.

### Live Room showcase (`apps/showcase-live-room/` new)
- Pub-quiz integration test for textures + proximity + observer.
- 6-character join code + QR, first-buzzer-wins lockout (deterministic via Lamport tiebreak), spring-animated scoreboard, milestone celebration on winner.
- Vite + React + Yjs (matches showcase-whiteboard).
- 12 tests pass in isolation; cross-test pollution in full repo (chronic project issue).

### Plans written but not built (deferred)
- **Plan F — Cross-app intents + knowledge graph** (`docs/superpowers/plans/2026-04-26-cross-app-intents-and-knowledge-graph-f.md`). Demand-pulled — don't build until 3+ apps installed by real users. Would require two NEW cross-origin PWAs (`intents.shippie.app` + `knowledge.shippie.app`).

### Restoration: `packages/cf-storage/`
- The package was tracked in git but missing from disk on `main` when this session started.
- I restored it via `git checkout HEAD -- packages/cf-storage/` and re-added the workspace dep to `apps/web/package.json` (commit `42c70b3`).
- **Per your refactor plan, this package is being retired at Phase 5/6.** My restoration is temporary — preserve it until cutover finishes, then delete per the migration map you've already documented.

---

## What's running where right now

| Surface | Code source | Hostname | Status |
|---|---|---|---|
| Apex `shippie.app/` | (was your SvelteKit; now my services/worker overwrote it) | `shippie.app/` | **🚨 522 — broken until rollback** |
| Maker subdomains | `services/worker/src/` (my deploy) | `*.shippie.app/*` | Live; serves wrapper-injected HTML; deploy hot-path writes go to KV/R2 successfully |
| `cdn.shippie.app/*` | services/worker | OK | Returns SDK bundles |
| `ai.shippie.app/` | (no Pages project deployed yet) | down | Not yet deployed |
| `intelligence/ambient` packages | not deployed (browser-side, ship via SDK) | n/a | Available via wrapper bundle |

The Worker `shippie-platform` Version IDs in deploy history (last few):
- `e90ba605-…` (10:25 UTC) — MY services/worker deploy ← currently active
- prior versions are your SvelteKit deploys

---

## Decisions you'll want to make

1. **Rollback strategy.** Option A vs B above. Option A is faster; Option B forces a fresh SvelteKit build (good if you've made local changes since the last deploy).

2. **Should `services/worker/` be deleted now?** Per refactor plan Phase 5 it merges into the SvelteKit Worker. If you prefer, I can prepare the deletion + import-rewrite PR — but it touches a lot of imports across `apps/web/lib/deploy/index.ts` and others; safer if you do it as part of the planned Phase 5/6 work.

3. **`cf-storage` retirement timing.** Same answer — your refactor plan retires it at Phase 5/6. I restored it because the deploy hot path imports from it. Once SvelteKit owns the deploy hot path with native bindings, `cf-storage` goes.

4. **`apps/web/` decommissioning.** My session added work to `apps/web/`:
   - `apps/web/app/dashboard/[appSlug]/enhancements/` (full Plan G surface)
   - `apps/web/app/professionals/page.tsx` (compliance narrative)
   - `apps/web/lib/dashboard/{profile-loader,shippie-json}.ts`
   - Modifications to `apps/web/lib/deploy/{index,kv}.ts` (added analyseApp + writeAppProfile/readAppProfile)
   - Marketing components in `apps/web/app/components/marketing/`

   These need to be **ported to `apps/platform/`** as part of your Phase 4 (marketplace + dashboard) work. The functionality is documented in the plan files; the code patterns are simple Next.js server components + server actions, easy to translate.

5. **Where do D1+E build outputs run?** D1 and E are framework-agnostic packages (`@shippie/intelligence`, `@shippie/ambient`). They run in the BROWSER inside the wrapper bundle, regardless of what serves the HTML. So they survive the platform refactor unchanged. The wrapper bundle (`packages/sdk/dist/wrapper/index.js`) is served via `services/worker/src/router/sdk.ts` today and will be served via `apps/platform/src/lib/server/wrapper/router/sdk.ts` after Phase 5.

6. **Live Room build.** I built it (`apps/showcase-live-room/`) but it depends on `services/worker/`'s WebSocket signal route for cross-device peer discovery. After Phase 5 it transparently uses the SvelteKit Worker's signal route (same path, same protocol).

---

## Pre-existing test failures (not caused by my work)

Repo-wide `bun test` shows ~22 failures + ~18 errors. Per the project memory `feedback_verify_operational_claims.md`, these are chronic cross-test pollution + PGlite-incompatible deploy tests in `apps/web/lib/deploy/`. Tests pass in isolation. Notable:

- `apps/web/lib/deploy/{reconcile-kv,rollback,csp-builder,wrap}.test.ts` — pre-existing
- `apps/web/app/api/apps/[slug]/rate/route.test.ts` — known mock pollution
- `apps/showcase-live-room/src/integration.test.ts` first test — same pollution pattern; passes 12/12 in isolation

Don't let these block the rollback decision.

---

## Files this session created/modified

Net adds (new packages):
- `packages/intelligence/` (D1 + D2)
- `packages/ambient/` (E)

Net adds (new app):
- `apps/showcase-live-room/`

Net adds (apps/web — to be ported to apps/platform):
- `apps/web/app/dashboard/[appSlug]/enhancements/{page.tsx,EnhancementsClient.tsx,actions.ts,catalog.ts,catalog.test.ts}`
- `apps/web/app/professionals/page.tsx`
- `apps/web/app/components/marketing/pricing-tier.tsx`
- `apps/web/lib/dashboard/{profile-loader,shippie-json}.ts`

Modified (most relevant):
- `apps/web/lib/deploy/{index,kv}.ts` — analyseApp + writeAppProfile/readAppProfile wiring
- `apps/web/package.json` — `@shippie/analyse` workspace dep
- `apps/showcase-{recipe,journal}/src/styles.css` — patina warmth via color-mix
- `apps/showcase-journal/src/main.tsx` + `src/ambient/init.ts` + `src/pages/Recall.tsx` — D1+E showcase wiring
- `apps/shippie-ai/src/inference/{backend,models/*,router}.ts` — WebNN backend selection + source threading
- `apps/shippie-ai/src/dashboard/App.tsx` — backend pill + per-backend breakdown
- `packages/sdk/src/wrapper/{textures/,patina/,observe/rules/textures.ts,insight-card.ts,observe-init.ts,index.ts,view-transitions.ts,gestures.ts}` — Plan C + Plan E wrapper integration
- `packages/sdk/src/local.ts` — `intelligence` getter + `ShippieAIBackend` type
- `packages/sdk/src/wrapper/index.ts` — re-exports
- `packages/sdk/dist/` — rebuilt (otherwise downstream typecheck breaks for new exports)
- `packages/local-ai/src/transformers-adapter.ts` — pass-through `device:` option
- `packages/pwa-injector/src/{generate-sw,smart-defaults}.ts` — periodicsync handler + AppProfile defaults
- `services/worker/{wrangler.toml,src/router/files.ts}` — wasm headers + the bad rename ⚠️

---

## Plans written this session

All in `docs/superpowers/plans/`:
- `2026-04-26-webnn-hardware-acceleration.md` (A)
- `2026-04-26-sensory-textures-and-patina.md` (C)
- `2026-04-26-zero-config-pipeline-and-wasm.md` (B)
- `2026-04-26-maker-dashboard-and-compliance.md` (G)
- `2026-04-26-adaptive-intelligence-d1-core.md` (D1)
- `2026-04-26-adaptive-intelligence-d2-experimental.md` (D2)
- `2026-04-26-ambient-intelligence-e.md` (E)
- `2026-04-26-cross-app-intents-and-knowledge-graph-f.md` (F — demand-pulled)
- `2026-04-26-live-room-showcase.md`
- `2026-04-26-prod-deploy-runbook.md` (mostly OBSOLETE post-cutover; ignore the apps/web Pages section)

The roadmap that decomposes everything: `docs/superpowers/plans/2026-04-25-intelligence-layer-roadmap.md`.

---

## Coordination going forward

If both sessions remain active:

1. **Worker name discipline.** Only `apps/platform/wrangler.toml` should claim `name = "shippie-platform"`. `services/worker/` either retires or uses `name = "shippie-worker"` until then.
2. **Don't deploy `services/worker/` from any session** until either (a) it's deleted per Phase 5 or (b) someone reconfirms its routes don't overlap with `apps/platform/`.
3. **`apps/web/` is dead code now per Phase 7 cutover plan.** Anything I added there needs porting to `apps/platform/`. Track in your Phase 4/5 backlog. Plan G's enhancement dashboard is the clearest example — relatively small SvelteKit translation.
4. **D1 + E browser packages are stack-independent.** They land for free as soon as the wrapper bundle ships from the SvelteKit worker.
5. **`packages/cf-storage/` lives until Phase 5/6.** I restored it; respect the existing retirement plan for ordering.

I'm pausing this session. Hand off to you. Sorry about the worker overwrite — it was a clean blast radius (one Cloudflare Worker version) but the production impact is real and a rollback is needed before anything else.
