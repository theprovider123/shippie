# Shippie — Forward Plan (v1)

> **Revised from v0 after architecture review.** v0 softened three differentiators (local runtime durability, shared local AI, native-feeling Feel on iOS). This version keeps the six pillars but adds hard architecture gates, pushes untrusted claims back into spikes, and sequences an ADR week before any Layer-3 code.

**Date:** 2026-04-24  
**Horizon:** 16 weeks to public open-source launch  
**Complements:** `2026-04-24-shippie-simplification.md` (Palate-surfaced polish — still authoritative for Pillar A.3)

---

## What changed from v0

| v0 claim | v1 revision |
|---|---|
| "Ship 3 cold-start apps before Local DB." | **Smoke test,** not cold-start. Full cold-start is 3 static now + 5–7 local-first after Pillar C + AI apps after Pillar D. |
| "Spike shared-model cache across subdomains in week 7." | **Don't promise it.** Ship `models.shippie.app` CDN first; treat cross-origin shared cache as progressive enhancement, not pitch. |
| "OPFS gives you forever storage." | **OPFS can be evicted.** Durability (export/restore/persistence/backup UX) is core to Pillar C from day one. |
| "Fix iOS haptics via WebKit message handler." | **Drop it.** That implies native WKWebView host. Shippie is pure PWA. iOS physical haptics is future-only. |
| "`shippie.json` — pick one schema." | **Two-layered.** Flat maker-facing public schema compiles into the existing richer internal schema. |
| "Service worker story is settled." | **It isn't.** Shippie owns root SW; maker SW becomes an explicit compatibility mode with a warn/disable/adapter path. |

---

## Principles (locked)

- **Polish blocks trust.** Finish Palate-surfaced leaks before anything else.
- **No managed backend.** No Shippie-hosted auth, db, email, AI endpoints. BYO or local.
- **No features without proof.** Capability badges emit from runtime telemetry, not `shippie.json` declarations.
- **Architecture before code for Layer 3.** ADRs first, spikes next, APIs last.
- **Main is sacred.** Every plan change stays on a branch until explicit authorization.

## Non-goals (explicit)

Managed auth, managed db, managed email relay, payments, org/teams, monetization UI in Layer 3 phase, summarization/generation AI before embeddings/classification prove out, iOS physical haptics, generation-AI model bundling.

---

## Architecture gates

Five gates. Each is a written decision with a go/no-go. Nothing downstream ships until the relevant gate closes.

### Gate 1 — Service-worker ownership (Pillar A, Week 1 Day 1)

**State:** Worker serves `/__shippie/sw.js` with `Service-Worker-Allowed: /` (`services/worker/src/router/sw.ts:16`). Injector registers it at root scope (`packages/pwa-injector/src/inject-html.ts:151`). This is correct for real offline — and collides with any maker SW at root.

**Decision:** Shippie owns the root SW on `{slug}.shippie.app`. Maker SW support is an explicit compatibility mode:
- **A1 — Disable:** preflight detects maker SW, refuses to register it, warns loudly.
- **A2 — Import:** maker SW code is `importScripts()`-ed into Shippie SW behind a controlled shim (shared `fetch`/`message` pipeline).
- **A3 — Limited wrapper mode:** URL-wrap apps opt out of Shippie SW ownership; `__shippie/*` routes continue; offline caching is best-effort only.

Default A1. Surface A2/A3 in the compatibility report (Gate 5).

**Exit:** ADR committed, preflight rule lands, deploy pipeline attaches the decision per-app.

### Gate 2 — Model caching strategy (Pillar D prerequisite, Week 4)

**Claim to retire:** "Downloaded once across all Shippie apps."  
**Reality:** Service workers, Cache API, IndexedDB, and OPFS are origin-partitioned; HTTP cache is partitioned by top-level site in modern browsers. Shared cache across `*.shippie.app` is not guaranteed by any spec.

**Staged approach:**
1. **Ship:** `models.shippie.app` — immutable chunked CDN, long `Cache-Control`, SRI hashes. Per-app `local-manifest.json` records which chunks downloaded. Worst-case: each app downloads once, best-case: HTTP cache opportunism across subdomains on same top-level site.
2. **Spike:** root-origin model hub at `shippie.app/model-loader` inside a hidden iframe, `postMessage` bytes to child origin. Measure real-world bandwidth savings on iOS/Android/desktop.
3. **Decide:** if spike saves >60% bytes on second-app install, promote to differentiator. Otherwise keep as quiet progressive enhancement.

**Exit:** Gate 2 spike report with numbers before Pillar D APIs are designed.

### Gate 3 — Storage durability (Pillar C, Week 3)

**OPFS is quota-managed and evictable.** Safari evicts script-created origin data after ~7 days of no user interaction. Chrome and Firefox evict under storage pressure.

**Every local-DB app must ship with:**
- `navigator.storage.persist()` request gated on user engagement (engagement-gated, not on load)
- Export to encrypted `.shippiebak` file (AES-GCM with user passphrase)
- Restore flow with schema-version check
- Quota telemetry + warning UI at 80%/95%
- "Last backup: X days ago" surface in app-level chrome

Delivered by `packages/local-db` as built-ins; makers can't opt out without replacing the whole local runtime namespace.

**Exit:** Gate 3 ADR + `packages/local-db` bakes these into the `shippie.local.db` contract.

### Gate 4 — `shippie.json` two-layer schema (Pillar A, Week 1 Day 1)

**Current:** rich internal schema at `packages/shared/src/shippie-json.ts` (build, pwa, sdk, permissions, compliance, reserved-paths conflict policy).  
**Vision:** flat maker-friendly schema (name, icon, theme_color, display, categories, local.{db,ai,sync}).

**Decision:** keep the internal schema as the compiled target; add a public surface.
- `shippie.json` as committed by makers uses the flat schema.
- Preflight compiles it into the internal schema via a deterministic lowering.
- Internal schema remains the contract consumed by deploy/worker/preflight — unchanged.
- Templates migrate to the flat schema; CLI `shippie init` writes the flat form.

**Exit:** ADR + Zod schema for public surface + lowering function + migration for `templates/shippie-starter/shippie.json`.

### Gate 5 — Wrapper compatibility report (Pillar A, Week 1 Day 2)

Every deploy emits a per-app report consumed by the dashboard and the public page:
- CSP mode (observed vs declared)
- SW conflict (Gate 1 branch taken)
- Manifest quality (icon parsed? sizes? theme color?)
- Offline readiness (assets pre-cachable? index exists?)
- Storage readiness (OPFS write probe passes? persist granted?)
- External network risk (domains extracted from CSP report-only mode, once available)

Public-page badges derive from this report — not from `shippie.json` claims. "Works Offline" means the runtime proved it.

**Exit:** Report shape + writer + one surface (maker dashboard). Public-page badge sourcing comes in Pillar F.

---

## Pillar A — Finish foundation + ADR week (Weeks 1–2)

**Exit criteria:** One user can deploy → share → install → rate without a maker-facing leak, and every architecture gate has an ADR on main.

### A.1 — ADR Week (Week 1)

Write these ADRs in `docs/superpowers/adrs/`:
1. `001-sw-ownership.md` — Gate 1 decision + compatibility modes
2. `002-model-caching.md` — Gate 2 staged approach + spike plan
3. `003-storage-durability.md` — Gate 3 mandatory primitives
4. `004-shippie-json-schema.md` — Gate 4 two-layer + lowering
5. `005-sdk-split.md` — `@shippie/sdk` (wrapper + BYO adapters) vs lazy `shippie.local.*` loaded via `/__shippie/local.js`. Don't retrofit `packages/sdk/src/db.ts`.

### A.2 — Palate public-page closures

From `2026-04-24-shippie-simplification.md`, ship:
- Phase 0.1 manifest-aware icon extraction (Expo-bundle parser)
- Phase 3.1 real-data leaderboards (kill seed)
- Phase 3.2 rate-route mock-pollution fix

### A.3 — CI/infra closures

- `bun-exit-99` on `apps/web` tests (pass/exit-99 mismatch; will bite external contributors)
- Sentry/Axiom pick — one commit left
- `env.ts` migration sweep (~20 route handlers still read `process.env.*` directly)

### A.4 — Compatibility report shape

Week 1 Day 2. Emit report per deploy → stored on `deploys` row. First consumer: maker dashboard.

### A.5 — Local runtime contract package

New `packages/local-runtime-contract`:
- TypeScript interfaces for `shippie.local.db`, `shippie.local.files`, `shippie.local.ai`
- Capability-detection module (`supportsOpfs()`, `supportsWebGPU()`, `supportsWasm()`)
- Error taxonomy (`QuotaError`, `EvictionError`, `MigrationError`, `UnsupportedError`)
- Bundle budget: 4 KB min, 30 KB max gzipped for the contract layer
- Zero runtime dependencies — implementations plug in

This is Gate 0 for Layer 3. APIs don't land until the contract exists.

---

## Pillar B — Smoke-test apps (Week 2)

**Purpose:** validate deploy → install → rate → analytics end-to-end with zero Layer-3 risk. Not the cold-start strategy.

Three apps, static or current-SDK only, one day each:
1. **Dough Ratios** (static calculator)
2. **Contrast Checker** (static utility)
3. **Palate polish pass** (existing live app → use as reference)

**Bar:** install funnel converts on real devices, ratings land, web-vitals populate dashboards with real numbers, compatibility report shows all-green.

Full cold-start (10–15 apps) resumes after Pillar C ships local-DB showcases and after Pillar D ships AI showcases.

---

## Pillar C — Local DB + files + durability (Weeks 3–7)

**Prerequisite:** Gates 3, 4, 5 closed.

### C.1 — Core
- `packages/local-db` using wa-sqlite + OPFS (fall back to IndexedDB VFS where OPFS unavailable)
- `packages/local-files` — OPFS path-based API
- Lazy-load via `/__shippie/local.js`, attach to `window.shippie.local.{db,files}`
- Schema-version tracking in IndexedDB; auto-ALTER between deploys
- FTS5 full-text search

### C.2 — Durability (Gate 3 mandatory)
- `navigator.storage.persist()` request helper (engagement-gated)
- `.shippiebak` export/import with AES-GCM + passphrase
- Schema-version check on restore with migration preview
- Quota telemetry → 80%/95% warning surface
- "Last backup" state in app-level chrome

### C.3 — Performance validation (Week 4 spike)
Validate the vision's targets on real mid-range Android:
- Query 10k records: <5ms
- Insert 1k records: <50ms
- FTS across 50k records: <20ms

If wa-sqlite+OPFS misses by >2×, re-evaluate before marketing claims.

### C.4 — Showcase app: Recipe Saver v2
**Demo bar (not merely "works offline"):**
- Instant full-text search over 1000+ seeded recipes
- Export to `.shippiebak`; restore from file
- Quota warning simulation
- Reinstall recovery (persist cookie + OPFS survive)
- Side-by-side speed demo vs hosted alternative

Recipe Saver becomes the reference demo for the whole platform.

---

## Pillar D — Local AI (Weeks 7–10)

**Prerequisite:** Gate 2 closed (spike report with numbers).

### D.1 — Scope control
Ship in order:
1. **Embeddings** (small model, ~100 MB) — powers vector search
2. **Text classification** (small model, ~300 MB)
3. **Sentiment** (reuse classification)

**Defer:** summarization, generation. Revisit only after model-size/latency/download UX prove on real devices.

### D.2 — Delivery
- `models.shippie.app` immutable chunked CDN (Gate 2 tier 1)
- Per-app `local-manifest.json` tracks which chunks are cached
- Download UX: first-install progress bar with cancel + resume
- WebGPU detection; WASM fallback mandatory (iOS Safari 26+ WebGPU is recent; partition-aware coverage testing required)
- `shippie.local.ai.available()` returns observed capability, not declared

### D.3 — Vector search
- Embeddings stored as BLOB in SQLite
- Brute-force cosine in WASM to 50k vectors; document HNSW as future
- `shippie.local.db.vectorSearch(collection, queryVec, { limit })`

### D.4 — Showcase apps
- **Journal with mood trends** (classification + embeddings + vector search)
- **Photo tagger** (vision model — only if Gate 2 tier 2 spike works; otherwise defer)

---

## Pillar E — Feel v1 (Weeks 10–12)

**Drop from v0:** iOS haptics via WebKit message handler (requires native host; Shippie is pure PWA).

### E.1 — What ships
1. **Tactile visual response** — button press spring + scale on tap, satisfying on every platform
2. **Spring-physics engine** (~3 KB) for modals, pull-to-refresh overshoot, scroll-bounce
3. **Real page transitions** — working slide/expand/rise/crossfade on View Transitions API with CSS fallback (not just the feature-detect)
4. **Install signature animation** — the 800ms icon-flight moment from the vision
5. **Android vibration** where the device supports it (existing `navigator.vibrate`)
6. **Optional audio palette** — Web Audio + 3 curated sprite packs, off by default

### E.2 — Explicitly deferred
iOS physical haptics (needs native shell), ambient light/time-shift, particle micro-interactions, motion parallax, sound auto-enable.

### E.3 — Feel opt-in surface
- `shippie.feel.*` public API attaches to same lazy loader as `shippie.local.*`
- Config from `shippie.json` flat schema (haptics, transitions, sound)

---

## Pillar F — Marketplace polish + monetization + launch (Weeks 12–16)

### F.1 — Capability badges from proof
Replace declared badges with telemetry-sourced ones:
- "Works Offline" → wrapper recorded a successful offline bootstrap
- "Local DB" → `shippie.local.db` accessed at runtime
- "Local AI" → model loaded from cache
- "No Data Leaves Device" → CSP report-only saw zero external network writes for 7 days
- "Privacy First" → compound badge requiring all above

### F.2 — Custom domains UI
Worker already resolves custom domains (`services/worker/src/routing.ts`). Control-plane UI + DNS verification + Cloudflare Custom Hostnames API = ~1 week.

### F.3 — Paid tier
- Stripe Billing
- Badge-removal toggle (Pro)
- Priority builds
- Advanced analytics

### F.4 — Open-source launch
- `docs.shippie.app` documentation site
- `docker compose up` self-hosting guide
- Public repo cleanup (LICENSE audit: AGPL vs MIT split per vision)
- README with demo GIF of Recipe Saver v2
- HN + Product Hunt launch

---

## Calendar

| Week | Focus | Must-land |
|---|---|---|
| 1 Day 1 | ADR Week kickoff | `001-sw-ownership`, `004-shippie-json-schema` drafts; Palate leak fixes merged |
| 1 Day 2 | Compatibility report | Report shape + writer + manifest-aware icon extraction |
| 1 Day 3–5 | Remaining ADRs | `002-model-caching`, `003-storage-durability`, `005-sdk-split`; CI closures; `local-runtime-contract` skeleton |
| 2 | Smoke-test apps | Dough Ratios, Contrast Checker, Palate polish. Bar: install funnel green across three apps on real devices. |
| 3 | Gate 3 lands | Durability primitives in `packages/local-db` skeleton; `.shippiebak` format spec |
| 4 | Gate 2 spike | `models.shippie.app` CDN up; cross-origin shared-cache spike measured |
| 4–7 | Pillar C | wa-sqlite + OPFS + FTS5 + durability + Recipe Saver v2 |
| 7–10 | Pillar D | Embeddings → classification → vector search; Journal + (optional) Photo Tagger |
| 10–12 | Pillar E | Spring engine, transitions, install signature, Android haptics, audio palette |
| 12–14 | Pillar F.1–F.2 | Capability-from-proof badges; custom domains UI |
| 14–16 | Pillar F.3–F.4 | Stripe, docs site, repo cleanup, launch |

---

## Open risks (ranked)

1. **Gate 2 outcome.** If cross-origin model sharing returns <60% savings, "local AI comes free" stops being a marketing line. The product still works — but the pitch shifts from "shared" to "optional, once per app."
2. **OPFS eviction in the wild.** Safari evicting data after 7 days of no interaction is a trust break waiting to happen. Gate 3 mitigations help; user education still needed.
3. **Performance targets on mid-range Android.** Vision's <5ms / <50ms / <20ms targets may miss. Spike in Week 4 before any marketing.
4. **WebGPU coverage.** iOS Safari 26+ only; desktop Chromium solid; Firefox recent. WASM fallback path must be fully functional, not a token.
5. **Maker SW collision.** Gate 1 default disables maker SW. Some makers will object. A2 (adapter) may escalate to a real engineering investment.
6. **`bun-exit-99`.** Still open. Will break external contributions the day the repo goes public.

---

## Decisions log (living)

| # | Decision | Status | Owner |
|---|---|---|---|
| 1 | Shippie owns root SW for hosted apps; maker SW has compat modes | Accepted — `docs/superpowers/adrs/001-sw-ownership.md`; preflight blocker landed | Codex |
| 2 | `models.shippie.app` CDN first; shared cache is progressive | Accepted — `docs/superpowers/adrs/002-model-caching.md`; spike still pending | Codex |
| 3 | OPFS durability is core to `packages/local-db` | Accepted — `docs/superpowers/adrs/003-storage-durability.md`; contract primitives landed | Codex |
| 4 | `shippie.json` two-layered (flat public → rich internal) | Accepted — `docs/superpowers/adrs/004-shippie-json-schema.md`; parser/lowering landed | Codex |
| 5 | SDK split — `@shippie/sdk` stays BYO; `shippie.local.*` lazy-loaded | Accepted — `docs/superpowers/adrs/005-sdk-split.md` | Codex |
| 6 | iOS physical haptics deferred to native shell (if ever) | Done in plan | — |
| 7 | wa-sqlite over sql.js for Layer 3 DB | Accepted for v0 — `wa-sqlite` installed; memory engine tested; OPFS route/assets wired for browser validation | Codex |
| 8 | Embeddings/classification first; no generation/summarization in v1 | Done in plan | — |
| 9 | Gate 0 local runtime contract package precedes implementations | Skeleton landed — `packages/local-runtime-contract` | Codex |
| 10 | Local files start with OPFS path API before SQLite lands | Skeleton landed — `packages/local-files` with safe paths + OPFS implementation | Codex |
| 11 | Local DB must prove durability and speed before app rewrites | Skeleton landed — `packages/local-db` with memory adapter, `.shippiebak`, and benchmark harness | Codex |
| 12 | Local AI begins with a CDN manifest contract, not runtime promises | Skeleton landed — `packages/local-ai` with model manifest validation, capability detection, and dev adapter | Codex |
| 13 | Base SDK exposes local runtime only through a lazy boundary | Landed — `shippie.local.load()` injects `/__shippie/local.js`; direct BYO adapters stay separate | Codex |
| 14 | Observability default is Axiom JSON logs, not Sentry app SDK | Landed — optional `AXIOM_*` sink in route logger; stdout remains dev fallback | Codex |
| 15 | View transitions need real modes, not only feature detection | Landed — wrapper injects slide/rise/expand/crossfade View Transition CSS with reduced-motion guard | Codex |
| 16 | Feel primitives share one spring model | Landed — wrapper exports a tiny spring frame/animation engine for modal, PTR, and install motion | Codex |
| 17 | Haptics should attach semantically, not only by manual calls | Landed — wrapper can delegate haptics for buttons, toggles, form submit, and invalid fields | Codex |
| 18 | `/__shippie/local.js` needs a real bundle artifact | Landed — `packages/local-runtime` builds `dist/local/v1.latest.js`, attaches OPFS files, and proxies wa-sqlite DB calls to a dedicated worker | Codex |
| 19 | SQLite API semantics should be engine-independent | Landed — `createSqliteLocalDb(engine)` compiles create/insert/query/search/update/delete/count/export/restore against a small engine interface | Codex |
| 20 | Local DB needs a concrete WASM engine before app rewrites | Landed — `createWaSqliteEngine()` backs the Shippie DB contract in memory; Worker serves WASM + DB worker assets for OPFS browser runtime | Codex |
| 21 | Local-first apps need a template, not just primitives | Landed — `templates/local-recipe-saver` exercises `shippie.local.db` create/insert/query/search/delete/export | Codex |
| 22 | wa-sqlite OPFS must run in a dedicated worker | Proven — browser smoke inserts through `window.shippie.local.db`, reloads, and reads the same OPFS row back; window-thread OPFS VFS is invalid because sync access handles are worker-only | Codex |
| 23 | Full-text search should use SQLite FTS5 when available | Landed — `db.search()` creates and maintains an FTS5 index with a LIKE fallback for engines/builds without FTS5 | Codex |
| 24 | Schema drift starts with additive auto-migrations | Landed — `db.create()` now auto-adds missing simple columns across deploys and rejects unsafe constrained additions with an explicit restore/manual-migration path | Codex |
| 25 | Local DB needs internal version metadata | Landed — SQLite DBs now keep `__shippie_meta` with app ID, schema version, and update timestamp for future eviction and compatibility checks | Codex |
| 26 | Marketplace badges need a proof source before telemetry matures | Landed — wrapper compatibility reports now derive Works Offline, Local Database, Local Files, Local AI, and Privacy First badges from wrapper/trust/manifest signals | Codex |
| 27 | Capability badges should be visible, not hidden in reports | Landed — marketplace cards and app detail heroes now surface public capability badges from the latest deploy report | Codex |
| 28 | Local AI delivery starts as model logistics, not inference magic | Landed — `packages/local-ai` now has a manifest-backed loader that fetches `models.shippie.app`, validates chunk byte counts/integrity, and stores model chunks in Cache API | Codex |
| 29 | Model CDN needs a repo-level contract | Landed — `models/README.md` and `models/manifest.example.json` document the immutable CDN baseline and keep shared-cache claims out of v1 | Codex |
| 30 | Long-running build needs a continuation map | Landed — `docs/superpowers/plans/2026-04-25-claude-handoff.md` captures current proof, test state, and next implementation steps | Codex |
| 31 | PGlite test harness coupling must not block CI | Landed — `apps/web/lib/test-helpers/pglite-harness.ts` (`setupPgliteForTest` / `teardownPglite`); the 3 previously-broken tests (`access/check`, `deploy/wrap`, `leaderboards.private`) now pass | Claude |
| 32 | Capability badges must be proven, not declared | Landed — `packages/local-runtime/src/telemetry.ts` emits `local.{opfs_probe,db_used,files_used,persist_granted,ai_model_cached}` proofs via beacon; `apps/web/lib/shippie/capability-proofs.ts` queries `app_events`; `publicCapabilityBadges` overlays proofs and marks badges `proven: true` | Claude |
| 33 | Recipe Saver must demonstrate the full local-DB story, not just CRUD | Landed — `templates/local-recipe-saver/index.html` adds restore from `.shippiebak`, persistence prompt, storage usage indicator, last-backup state, quota warning surface | Claude |
| 34 | Local AI v1 needs real inference, not just a dev adapter | Landed — `packages/local-ai/src/transformers-adapter.ts` wraps `@huggingface/transformers` via injected loader (testable, no hard dep). Embeddings + zero-shot classification + sentiment only; vision and generation deferred. Configures `env.remoteHost = models.shippie.app` per ADR 002 | Claude |
| 35 | Vector search needs an end-to-end demo | Landed — `templates/local-journal/` exercises `shippie.local.ai.embed` + `shippie.local.db.vectorSearch` for semantic recall, plus per-entry sentiment tagging | Claude |

---

## Success bars (90 days from Week 1)

- 50+ apps deployed by real makers
- 15+ apps using `shippie.local.db`
- 5+ apps using `shippie.local.ai`
- 500+ users with a Shippie app installed to their phone
- Avg app load <300 ms on wrapper beacon
- 500+ GitHub stars
- Zero trust breaks from OPFS eviction in public-facing apps
- Recipe Saver v2 demos at "I didn't know a web app could do this"

---

## What this plan does not do

- Does not commit to Shippie-hosted backend anything
- Does not promise shared local-AI cache until Gate 2 spike proves it
- Does not claim iOS physical haptics
- Does not treat `shippie.json` as either/or
- Does not start Layer 3 code before Gates 0/3/4 are written down
- Does not merge to main from agent sessions without explicit authorization
