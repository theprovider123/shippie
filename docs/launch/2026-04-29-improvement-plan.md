# 2026-04-29 — Showcase improvement plan (rev 2)

> Make the showcase library a *visceral* demonstration of Shippie's
> ideology: every app proves a specific local-first / cross-app /
> sensory / mesh claim that no cloud-platform app could match.

**Scope:** ~55 improvements to 11 existing apps + 10 new pre-seeded
apps + 5 platform unblockers + 1 launch-verification phase.

**Realistic effort:** ~140–200 focused hours. **5–7 weeks elapsed**
solo (rev 1 said 3–4; the prior estimate was 30–50% optimistic and
didn't budget review/feedback/redeploys/device verification).

**Ground rules:**
1. No reductions — every improvement and every new app ships.
2. Simplifications come from sequencing, scaffolds, and shared
   templates — never from cutting features.
3. Each P1 unblocker ships as **its own commit**. No squash. The
   plan provides coherence; commits stay reviewable + revertable.
4. Health stays green at every track boundary, with **explicit
   target counts per phase** (below).
5. Per-track ethos audit (origin / offline / locality / self-hostable).

---

## Sequencing logic

```
P1 Platform unblockers (4 separate commits, ~3 days)
   ├── 1A bridge capabilities ← needs design pass before code
   ├── 1B AI model loader      ← biggest infra ROI; cache budget
   ├── 1C CORS proxy           ← SSRF list + per-user quota
   └── 1D HRM GATT helper      ← Chrome/Edge only, doc'd loudly

P2 Tooling (after P1A; ~4h)
   └── 2A `bun run new:showcase` scaffold

P3 Existing-app pass A (parallel-safe; ~28h)
   └── sensory + intent + UI polish

P4 New apps (after P2; ~50h)
   ├── 4A Micro-logger template + 5 configs ← shared @shippie/micro-logger
   ├── 4B Productivity (3 apps; Read-It-Later needs P1C)
   ├── 4C Memory + social (2 apps)
   └── 4D Daily Briefing (depends on P3 AND P4A — both)

P5 Existing-app pass B (after P1B; ~30h)
   └── Per-app vision/sentiment/classify/whisper integrations

P6 Acceptance + polish (~14h, throughout)
   ├── Cross-cluster intent tests
   ├── Per-pass demo recordings
   └── Marketplace metadata refresh

P7 Launch verification (~8h, user-side)
   ├── Real iPhone Safari + Android Chrome walkthrough
   ├── Cellular model-download check
   ├── Mesh demo on two phones in same room
   └── 2-min master cut re-recorded on real hardware
```

**P1 must happen first** (each commit independently). **P2–P3 overlap.**
**P4 starts after P2.** **P5 starts after P1B.** **P6 trickles
throughout.** **P7 is user-side and gates "shipped to launch."**

---

## P1 — Platform unblockers (~3 days; 4 separate commits)

### P1A — Three new bridge capabilities (~10h)

> Increased from 6h after the security review. Each capability needs
> a design pass first, then implementation, then tests.

**Design before code.** Each cap gets a written spec (in this doc)
covering threat model + data scope + grant model.

#### `apps.list` — DESIGN

The list of installed apps + their declared intents is **a fingerprint
of the user's habits and identifies them across iframes.** "Never any
data" was wrong framing in rev 1 — the list itself is data.

**Two scoping options, pick one:**

- **Option A (recommended for v1):** scope to apps that **declare a
  matching intent** with the caller. Habit Tracker subscribes to
  `cooked-meal` → `apps.list` returns only providers of `cooked-meal`
  (plus the caller). No correlation across the user's full app set.
  Sufficient for the use-cases in this plan; minimises fingerprint.
- **Option B:** require a one-time grant ("Habit Tracker wants to see
  your installed apps. Allow?"). Like browser permission prompts.
  Higher friction but unlocks dashboards that need the full set
  (Daily Briefing).

**Decision:** Ship A first. If Daily Briefing needs the full set,
add B as `apps.list({ scope: 'all' })` requiring grant.

**Test invariant:** an iframe declaring no intents calls `apps.list()`
and gets back `[]` — never the user's full app set.

#### `agent.insights` — DESIGN

Filtering by `callerAppId` is necessary but not sufficient. The
**source-data invariant** is: the agent must only return insights
derived from data the calling app already has access to (its own
namespace + intents it consumes).

**Implementation rule:** before returning an insight, check that
every input row in the insight's provenance belongs to a namespace
the caller has read access to (its own slug or a granted intent).
Insights computed from cross-app correlations the caller never
saw are dropped.

**Test invariant:** install three apps A, B, C. A has no intent
overlap with B/C. Run the agent. A calls `agent.insights()`. The
result must contain zero insights derived from B or C data, even
if they're tagged with A's slug.

#### `data.transferDrop` — DESIGN

Rev 1 missed the **target-selection step**. Without one, the source
iframe doesn't know which destinations have a matching drop zone.

**Three-message dance:**
1. Source iframe broadcasts `transferDrop.starting({ kind, preview })`
   when the user starts a drag.
2. Container forwards to all granted iframes; eligible destinations
   render a "drop here" overlay (the SDK exposes a hook for this).
3. On drop, source calls `transferDrop.commit({ payload, targetSlug })`.
   Container delivers payload to that target.

**Eligibility:** a destination iframe declares `acceptsTransfer:
{ kinds: ['recipe', 'note', ...] }` in its `shippie.json`. Container
filters destinations by kind match. No hardcoded routing.

**Permission:** universal for declaring acceptance. Per-source-target
pair grant on first commit (mirrors the intent-grant flow).

#### Implementation (after design lands)

For each cap: contract entry, host handler, SDK helper, vitest
suite. Same pattern as `intent.provide` we shipped in A2. Each cap
ships as its own commit.

**Definition of done per cap:**
- Test invariants above pass.
- iframe-sdk has a typed helper.
- Existing showcase using each cap (Habit Tracker for `apps.list`
  and `agent.insights`; Meal Planner ↔ Recipe Saver for
  `data.transferDrop`) demos end-to-end.

**Health gate after P1A:** 41/41 typecheck · ~58/58 test (+6 cap
tests) · 37/37 build.

### P1B — AI model loader (~10h, was 1d)

> Increased from 1d after cache budget + iOS verification reality.

**Today:** worker dispatcher exists, model loader stubbed
`'unavailable'`.

#### Cache footprint budget

Full-precision sizes if a user installs every showcase that needs
each model:

| Model | Full | Quantized (q8) | Apps that need it |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` | 22 MB | ~6 MB | Daily Briefing, future search |
| `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | 250 MB | ~67 MB | Journal sentiment |
| `Xenova/nli-deberta-v3-xsmall` | 70 MB | ~22 MB | Shopping List aisle classify |
| `Xenova/vit-base-patch16-224` | 88 MB | ~25 MB | Recipe + Pantry + Body Metrics vision |
| `Xenova/trocr-base-printed` | 330 MB | ~95 MB | Recipe Saver OCR |
| `Xenova/whisper-tiny` | 39 MB | ~10 MB | Journal voice notes |
| **Total full** | **~800 MB** | **~225 MB** | All 6 |

**Decisions:**
1. **Ship quantized (q8) variants by default.** ~225 MB is acceptable
   when amortized across many apps; ~800 MB is a launch blocker on
   iOS where Cache Storage faces aggressive eviction.
2. **LRU eviction** when CacheStorage rejects a put (`QuotaExceededError`).
   Drop least-recently-used model entries; the next call re-downloads.
3. **First-run UX** shows model name + size + estimated download
   time, asks for "OK to download" on cellular (`navigator.connection`).
4. **`models.shippie.app` is a CF Worker** that proxies HuggingFace
   with **CF caching enabled**. Currently TBD — verify before P1B
   ships. If it's a passthrough, set up a CF Worker for it as part
   of this commit (3h additional).

**Implementation:**
1. Add `@huggingface/transformers` as a worker-only dep.
2. Update `packages/local-ai/src/transformers-adapter.ts` defaults
   to point at q8 variants.
3. Add `whisper` task to dispatcher + SDK.
4. Wire LRU eviction in `packages/local-ai/src/loader.ts`.
5. Verify on real Chrome/Android (WebGPU) AND real iOS Safari
   (WASM). The verification eats ~half a day if any backend
   misbehaves — budgeted in.

**Definition of done:**
- `ai.run('classify', text, { labels })` returns `local` source on
  Chrome and Safari.
- LRU eviction test passes (mock CacheStorage with QuotaExceededError).
- Cellular first-run UX surfaces a confirm dialog.

**Health gate after P1B:** typecheck/test/build counts unchanged;
new tests in `packages/local-ai`.

### P1C — CORS proxy with SSRF guards (~3.5h, was 1h)

> Triple-revised from 1h after the security review.

**Threat model:** an attacker's iframe asks the proxy to fetch
`http://169.254.169.254/latest/meta-data/` (AWS metadata) or
`http://10.0.0.1/admin` (private IP) and reads back internal data.

**Mitigations (mandatory):**

1. **Block private IP ranges** before fetch:
   - IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`
     (AWS metadata + link-local), `172.16.0.0/12`, `192.0.0.0/24`,
     `192.168.0.0/16`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`.
   - IPv6: `::1`, `fc00::/7`, `fe80::/10`, `2001:db8::/32`.
2. **Resolve hostname before request, then block based on the
   resolved IP** — not the hostname. Prevents DNS-rebinding attacks
   where `evil.com` resolves to a public IP at first lookup but a
   private IP on the next.
3. **Refuse non-http(s)** schemes outright (`file://`, `gopher://`,
   etc.).
4. **Disable redirects past the first one OR re-run SSRF check on
   each redirect target.** A 302 → internal IP must be caught.
5. **Per-user quota** — 100 fetches per hour per session, enforced
   by D1 row keyed on session id. Not just CF's global rate limit.
6. **Response size cap** — 5 MB max; stream and abort.
7. **Strip Set-Cookie + sensitive headers** from response.
8. **Refuse content types not in allowlist:** `text/html`,
   `application/xhtml+xml`, `text/plain`, `application/rss+xml`,
   `application/atom+xml`. No images, no PDFs (Read-It-Later is
   text-only).

**Implementation file:** `apps/platform/src/routes/__shippie/proxy/+server.ts`

**Tests:** SSRF allowlist + denylist, redirect-into-private-IP block,
DNS-rebind block, quota enforcement, content-type allowlist.

**Definition of done:** Read-It-Later can fetch any public article
and the SSRF test suite (~20 cases) passes.

**Health gate after P1C:** +1 platform test file.

### P1D — HRM GATT helper (~3h, with explicit iOS no-go)

iOS Safari **does not implement Web Bluetooth.** This is a hard
non-support, not a graceful fallback. Workout Logger's HRM feature
is **Chrome-on-Android-only.**

**Showcase UX must say so explicitly:**
- Header on the BLE pairing screen: "Heart-rate pairing requires
  Chrome on Android. On iPhone, log workouts manually — every other
  feature still works."
- Don't render the pair button on iOS at all (use
  `detectBleAvailability()` we shipped in Phase 6).

**Implementation:** add `pairHrm()` to
`packages/proximity/src/ble-beacon.ts`. Connects to GATT service
`0x180D`, subscribes to characteristic `0x2A37`, parses HR + RR
intervals from the Heart Rate Measurement format. Returns a
`ReadableStream<{ bpm: number, rrIntervalsMs: number[] }>`.

**Tests:** parse-format unit tests against the spec's example bytes;
mock `navigator.bluetooth` for connection flow.

**Definition of done:** Workout Logger pairs to a real Polar/Wahoo
strap on Chrome Android. iOS shows the explanatory message instead.

**Health gate after P1D:** +1 proximity test file.

---

## P2 — Tooling (~5h, after P1A)

### P2A — `bun run new:showcase <slug>` scaffold

10 new apps × ~30 min boilerplate per = ~5h saved. Worth investing
~5h up front (was 4 — bumped for first-run debug + template polish).

**Plan:**
- `scripts/new-showcase.mjs` reads `templates/showcase-template/`,
  performs slug substitution, creates `apps/showcase-<slug>/{...}`,
  picks an unused port from 5191+, registers in container's curated
  list (with TODO comments for intents), adds to
  `FIRST_PARTY_SHOWCASE_SLUGS` in `hooks.server.ts`, appends to the
  seed migration.

**Definition of done:** `bun run new:showcase widgets` produces a
working showcase that builds, deploys, and renders in the container
in 60s end-to-end (including verification curl).

---

## P3 — Existing-app pass A: sensory + intent + UI polish (~28h)

> Re-estimated from 22h — per-app touch averages ~2.5h not 2h once
> you include intent-broadcast tests, demo cuts, and per-app
> manifest tweaks.

**Pattern per app:** wire iframe-sdk (5 already done; 5 to go),
fire `feel.texture(...)` on every meaningful state transition,
broadcast provided intents and subscribe to consumed ones, ship
2–3 small UI polish items.

### Per-app to-do list

(Same list as rev 1 — copied here for completeness.)

#### Recipe Saver
- Cooking-mode timer → `cooking-now` intent broadcast.
- `milestone` texture on mark-cooked.
- Subscribe to `pantry-inventory`; render ingredients green/red.
- `confirm` texture on save.

#### Journal
- Wire iframe-sdk.
- Three-tap entry flow: mood-slider → one sentence → done.
- Subscribe to `cooked-meal`, `workout-completed`,
  `body-metrics-logged`. Surface contextual prompts.
- `complete` texture on save; `tap` haptic on slider detents.

#### Whiteboard
- Wire iframe-sdk.
- Mesh-only mode by default via `@shippie/proximity` Group.
- Stroke-replay scrubber via proximity `EventLog`.
- `navigate` on undo, `refresh` on clear, `confirm` on stroke.

#### Live Room
- Wire iframe-sdk.
- Live-latency overlay: ms-since-question per buzzer.
- Mesh-status badge integration.
- Crowd-poll integration (Phase-6 primitive).
- `error` for wrong, `milestone` for round winner, `install` on
  session start.

#### Habit Tracker
- 365-day streak grid per habit.
- Auto-suggest habits from `apps.list` results (after P1A).
- Per-app insight strip via `agent.insights` (after P1A).
- `confirm` on tap, `milestone` at 7/30/100-day streaks.

#### Workout Logger
- Session timer with rest-period haptics.
- Subscribe to `sleep-logged`; surface 14-day correlation.
- DeviceMotion auto-detect walk/run.
- `error` on overtraining, `milestone` on PR, `complete` on close.
- HRM pairing (after P1D, Chrome Android only).

#### Pantry Scanner
- Camera scan via `BarcodeDetector`.
- Expiry tracking + Web Push notification 2 days before.
- `pantry-low` intent on stock = 0.
- `confirm` on scan, `refresh` on update.

#### Meal Planner
- `cooked-meal` history → "schedule again?" suggestions.
- Smart leftover routing.
- Drag-from-Recipe-Saver via `data.transferDrop` (after P1A).
- `spring` on slot fill, `complete` when week is full.

#### Shopping List
- Multi-phone mesh sync via `@shippie/proximity` Group.
- Cross-off haptic + line-through transition.
- `needs-restocking` intent broadcast.
- `tap` on cross-off, `milestone` when list complete.

#### Sleep Logger
- Correlation scatter plot (locally drawn SVG).
- Sleep-debt running average.
- Subscribe to `caffeine-logged` (Caffeine Log lands in P4A).
- `error` on sub-5h night, `milestone` on 7-night 7+h streak.

#### Body Metrics
- Photo time-lapse scrub.
- Permanent privacy ribbon at top with link to source code.
- `body-metrics-logged` intent broadcast.
- `complete` on log, `error` near storage quota.

**Health gate after P3:** 41/41 typecheck · ~85/85 test (+27
per-app intent acceptance tests) · 37/37 build.

---

## P4 — New apps (~52h, was 50)

### P4A — Micro-logger template + 5 configs (~12h, was 15)

> Rewritten per review. Build the template **once**; the 5 apps are
> config files, not 5 implementations. Saves ~8h vs 5-implementations
> approach AND becomes a marketplace story ("this is how easy a
> Shippie app is — 30 lines of config").

**New package:** `packages/micro-logger`

```ts
// packages/micro-logger/src/index.ts
export interface MicroLoggerConfig {
  appId: string;          // 'app_caffeine_log'
  slug: string;           // 'caffeine-log'
  name: string;           // 'Caffeine Log'
  intent: string;         // 'caffeine-logged'
  consumes?: string[];
  buttonLabel: string;    // 'Log a coffee'
  themeColor: string;
  chart: 'sparkline' | 'heatmap' | 'count';
  rowSchema: Record<string, 'string' | 'number' | 'date'>;
  defaults?: Record<string, unknown>;
}

export function createMicroLoggerApp(config: MicroLoggerConfig): React.FC;
```

Each showcase app becomes:

```tsx
// apps/showcase-caffeine-log/src/App.tsx
import { createMicroLoggerApp } from '@shippie/micro-logger';
import config from './config.ts';
export const App = createMicroLoggerApp(config);
```

**5 configs:**

| Slug | Provides | Consumes | Chart | One-line |
|---|---|---|---|---|
| `caffeine-log` | `caffeine-logged` | — | sparkline | Single tap to log a coffee/tea. |
| `hydration` | `hydration-logged` | `cooked-meal` | count (vs target) | Daily water target. |
| `mood-pulse` | `mood-logged` | `caffeine-logged`, `workout-completed`, `sleep-logged` | sparkline + correlation overlay | 3-second mood tap. |
| `symptom-tracker` | `symptom-logged` | — | heatmap | Aches, allergies, headaches with severity. |
| `steps-counter` | `walked` | `workout-completed` | sparkline | DeviceMotion-based step count, doesn't double-count gym. |

**Build cost:**
- Template: ~6h (UI + IndexedDB + intent broadcast + 3 chart variants
  + tests).
- 5 configs: ~1.2h each (config file + manifest + seed migration +
  port + curated registration).
- Total: ~12h.

**Health gate after P4A:** +1 package (`@shippie/micro-logger`) +5
showcase workspaces → 47/47 typecheck · ~95/95 test · 43/43 build.

### P4B — Productivity (~22h, was 18)

> +4h for Read-It-Later's reader UI (was under-budgeted) and
> Daily Briefing's dependency on P3 apps wiring intents (additional
> integration testing after each P3 app lands).

| Slug | Effort | Notes |
|---|---|---|
| `pomodoro` | ~5h | 25/5 cycle; `feel.texture('navigate')` on phase transition; `focus-session` intent broadcast on completion. |
| `read-later` | ~9h | Paste URL → fetch via `/__shippie/proxy?url=` (P1C) → store HTML locally → render via Readability.js in-iframe. Subscribes to `mood-logged` for mood-based suggestions. Reader UI (typography, themes, scroll progress). |
| `daily-briefing` | ~8h | **Depends on P3 + P4A.** Subscribes to ~9 intents. Renders one screen at 8am. Uses `agent.insights` (P1A). |

### P4C — Memory + social (~14h, was 12)

| Slug | Effort | Notes |
|---|---|---|
| `restaurant-memory` | ~7h | Photos in IndexedDB. Subscribes to `cooked-meal` for home-vs-out ratio. Provides `dined-out`. Geolocation API for "where". |
| `show-and-tell` | ~7h | Mesh-only ephemeral scratchpad. Anyone in a Nearby room drops content. Auto-clears when room empties. No persistence. |

### P4D — Daily Briefing dependency note

**Daily Briefing depends on BOTH P3 (intents broadcast by existing
apps) AND P4A (intents broadcast by new micro-loggers).** Land it
last in P4. Without P3 wiring, the briefing has nothing from Recipe
Saver / Journal / Workout Logger / etc. to surface.

**Health gate after P4D:** +10 showcase workspaces total →
51/51 typecheck · ~115/115 test · 47/47 build.

---

## P5 — Existing-app pass B: AI features (~30h, was 25)

> +5h after review: each integration is ~5–6h not 3h once you include
> first-run UX, fallback rendering when model load fails, iOS
> verification, and acceptance test.

| App | Feature | Model | Effort |
|---|---|---|---|
| Recipe Saver | Photo → ingredients OCR | TrOCR-q8 | ~6h |
| Recipe Saver | Photo → "what dish is this?" | ViT-q8 | ~3h (shared model with below) |
| Journal | Sentiment-arc sparkline | DistilBERT-SST2-q8 | ~5h |
| Journal | Voice-note transcription | Whisper-tiny-q8 | ~6h (mic permission + recording UI) |
| Whiteboard | Shape recognition | ViT-q8 + custom heuristic | ~4h |
| Pantry Scanner | Photo-to-item identification | ViT-q8 | ~4h |
| Shopping List | Item-by-aisle classifier | DeBERTa-xsmall-q8 | ~3h |
| Body Metrics | Body-fat % estimate (heavily disclaimed) | ViT-q8 + height/weight | ~4h |

**Pattern per integration:**
1. Showcase calls `shippie.ai.run({ task, input })` via iframe-sdk.
2. Surface first-run download progress (size + ETA + cellular warn).
3. Cache hit on subsequent calls — instant.
4. **Feature flag:** if `source: 'unavailable'`, hide the AI feature
   instead of showing it broken. App still works without.
5. **iOS verification per feature** — the WASM backend on iOS Safari
   is the slowest path; some features may be honestly unusable
   (Whisper-tiny WASM on iOS will likely take 5–8s for a 10s clip
   — that's in the risk register).

**Health gate after P5:** package counts unchanged; +8 acceptance
tests (one per AI integration); per-feature feature-flag tests.

---

## P6 — Acceptance + polish (~14h, throughout)

### P6A — Cross-cluster intent acceptance tests

15+ new intents introduced; each gets a vitest in
`apps/platform/src/lib/container/intent-broadcast.test.ts` style.

### P6B — Per-pass demo recordings

After each P3 / P4 / P5 lands, a 30s vignette via
`tools/recording/cross-cluster.record.ts`. Cumulative cuts for
homepage hero, Twitter, Hacker News submission.

### P6C — Marketplace metadata refresh

Each app gets real `tagline`, real `description`, real category,
real `icon.svg`. Update the seed migration or follow-up migration.

### P6D — Showcase catalog refresh

`packages/templates/src/showcase-catalog.ts` updated to know about
all 21 apps so the cross-cluster test surface stays authoritative.

---

## P7 — Launch verification (~8h, USER-SIDE)

> New phase. Distinguishes code-complete from launch-complete.
> CLAUDE.md flags this as user-side outstanding; rev 1 didn't budget
> the lag between "I shipped P5" and "I verified on a phone."

### P7A — Real-device walkthrough

- iPhone Safari + Android Chrome
- Add-to-Home-Screen on each
- All 21 apps install via the container, render, persist data
- Mesh demo on **two real phones** in the same room (not browser
  contexts) — verify P3 Whiteboard sync, Live Room buzzer, Show &
  Tell ephemeral share
- AI runs locally on real iOS — confirm Whisper-tiny is or isn't
  usable in WASM on real hardware
- Cellular model-download check — does the cellular UX warn correctly?

### P7B — Production deploy verification

- All 21 showcases reachable at `https://shippie.app/run/<slug>/`
- All 21 visible at `https://shippie.app/apps`
- Every cross-app intent demonstrated end-to-end on a real phone

### P7C — 2-min master cut re-recorded

The Playwright rough-cut at
`docs/launch/recordings/c2-cross-cluster.webm` is replaced by a real
2-min screen recording on real devices, per the storyboard at
`docs/launch/c2-demo-storyboard.md`.

---

## Risk register

(New section per review.)

| Risk | Likelihood | Mitigation |
|---|---|---|
| **WebGPU detection on iOS Safari** — none today, all AI runs through WASM | Certain | Quantized models (P1B); LRU eviction; honest disclaimers in UX. Whisper-tiny WASM on iOS Safari likely 5–8s for a 10s clip — may need to disable on iOS. |
| **CacheStorage eviction on iOS under storage pressure** | High | LRU strategy in P1B; first-run UX warns ~225MB total cache; quantized models keep budget down. |
| **`models.shippie.app` CDN doesn't exist as a CF-cached origin** | Medium | Verified explicitly in P1B as a checkbox; if not, set up a CF Worker proxy as part of P1B (3h additional). |
| **iOS Safari Web Bluetooth = zero support** | Certain | P1D ships HRM as Chrome-Android-only; UX states this loudly; no surprise at P7. |
| **iOS Safari aggressive Cache eviction during P5 demos** | High | LRU eviction on QuotaExceededError; per-feature feature flag drops AI gracefully. |
| **Proximity mesh under poor RF** (typical venue) | Medium | Existing `@shippie/proximity` falls back through STUN/TURN if direct mesh fails. Demo recordings shot on a known-good network. |
| **Model downloads on cellular** | Medium | First-run UX detects `navigator.connection.type` and warns + asks confirmation before download. |
| **Per-iframe iOS storage scoping inconsistencies** | Medium | All showcases use IndexedDB scoped to the runtime origin (`shippie.app`); no per-subdomain partitioning needed since `/run/<slug>/` is same-origin. |
| **CORS proxy abused as SSRF vector** | High if not guarded | Full SSRF guard list (P1C): private IP block + DNS-rebind block + redirect re-check + per-user quota. |
| **Cross-app intent fingerprinting via `apps.list`** | Medium | Scoped to overlap-only (P1A Option A). Option B grant flow if needed later. |
| **Daily Briefing nothing-to-show on day 1** | Certain | Empty-state copy: "Your briefing fills in as you use other Shippie apps. Try Caffeine Log first." |
| **Real-device demo regressions between deploys** | Medium | `bun run smoke` already wired (Phase B); add to CI on every PR. |

---

## Cross-cutting patterns

| Pattern | Where | Saving |
|---|---|---|
| iframe-sdk consolidation | already shipped | ~30h vs hand-rolling postMessage |
| `bun run new:showcase` scaffold | P2A | ~5h × 10 apps = 50h saved... wait, that's high. Realistic saving: ~30 min × 10 = 5h |
| `@shippie/micro-logger` template | P4A | ~8h vs 5 implementations |
| Single P1B for all AI | P1B | ~12h vs per-app model loaders |
| Feature flags on AI-dependent features | P5 | Lets P5 ship before all models load on every device |
| Per-track ethos audit | every commit body | Avoids architectural drift |

---

## Realistic effort summary

| Phase | Hours | Notes |
|---|---|---|
| P1A bridge caps | 10 | +design pass |
| P1B AI loader | 10 | +cache budget, +iOS verify, +CF proxy verify |
| P1C CORS + SSRF | 3.5 | +full SSRF list, +per-user quota |
| P1D HRM | 3 | Chrome-Android-only, doc'd |
| P2A scaffold | 5 | first-run debug |
| P3 (11 apps × ~2.5h) | 28 | per-app intent + sensory + polish |
| P4A micro-logger + 5 configs | 12 | template, not implementations |
| P4B productivity (3) | 22 | reader UI, briefing dependency |
| P4C memory+social (2) | 14 | photo + mesh |
| P4D briefing | included in P4B above |
| P5 (8 AI integrations) | 30 | first-run UX, fallback, iOS verify per |
| P6 acceptance + polish | 14 | tests, recordings, metadata |
| **Subtotal focused work** | **~152** | rev 1 said 100–150 |
| Review/feedback/redeploy buffer (~25%) | ~38 | not in rev 1 |
| **Realistic focused total** | **~190** | |
| P7 launch verification (user-side) | 8 | not in rev 1 |
| **Total to launch** | **~198 hours** | **5–7 weeks elapsed** |

---

## Critical path (revised)

If only one person works on this, **the minimum demonstrable slice** is:

```
P1B (10h) → P2A (5h) → P4A (12h) → P3 partial (8h to wire intents
                                     in apps Daily Briefing reads)
                                  → P4D (8h) → P5 Recipe Saver (6h)
                                  → demo recording (2h)
```

That's ~51 focused hours = **~1.5 weeks** for the minimum showcase.
After that, the rest lands in any order.

If two or more people:
- Person A: P1 → P5 (AI track)
- Person B: P2 → P3 → P4 (apps track)
- Both converge for P6.
- Solo / user-side: P7.

---

## Health gate targets per phase

Today's baseline: **41 typecheck · 52 test packages · 37 build · 1061 individual tests passing.**

| After phase | Typecheck | Test pkgs | Build | New tests |
|---|---|---|---|---|
| P1A | 41 | 52 | 37 | +6 cap tests |
| P1B | 41 | 52 | 37 | +5 loader tests |
| P1C | 41 | 52 | 37 | +20 SSRF tests |
| P1D | 41 | 52 | 37 | +4 HRM tests |
| P2A | 41 | 52 | 37 | +1 scaffold smoke |
| P3 | 41 | 52 | 37 | +27 per-app intent tests |
| P4A | 47 | 58 | 43 | +1 template + 5 config + 5 acceptance |
| P4B | 50 | 61 | 46 | +3 app tests |
| P4C | 52 | 63 | 48 | +2 app tests |
| P4D | 53 | 64 | 49 | +1 briefing test + cross-app integration |
| P5 | 53 | 64 | 49 | +8 AI feature flag tests |
| P6 | 53 | 64 | 49 | +N acceptance |

Any phase that doesn't hit its target = does not ship.

---

## What this plan deliberately does NOT do

- **Native shell graduation per showcase** — `shippie graduate` CLI exists; real wraps wait for maker pull.
- **Per-app CF Pages projects** (Option 1 from URL-strategy) — `/run/<slug>/` is the canonical URL.
- **iOS-only PWA install per showcase** — container is the install surface.
- **Remaining Phase 6** — hotspot handoff, stadium pilot, cross-LAN federation real-hardware testing, OS dissolution.

---

## Suggested next action

Authorise P1A → P1D as **four separate commits** (not one squash).
Each is independently reviewable. Each has its own design pass + tests.
Total: ~3 days of focused work.

After P1 lands and `bun run health` is green at the right counts,
P2/P3/P4 can move in parallel.

I can start P1A right now if authorised. Otherwise this doc is the
brief.
