# 2026-04-29 — Showcase improvement plan

> Make the showcase library a *visceral* demonstration of Shippie's
> ideology: every app proves a specific local-first / cross-app /
> sensory / mesh claim that no cloud-platform app could match. This
> is the plan to land everything on `origin/main`.

**Scope:** ~55 improvements to 11 existing apps + 10 new pre-seeded
apps + 5 platform unblockers. Total raw: ~100–150 hours of focused
work. ~3–4 weeks at full intensity, ~6–8 weeks realistically.

**Ground rules:**
1. No reductions — every improvement and every new app ships.
2. Simplifications welcome — batch similar work, share scaffolds,
   reuse patterns.
3. Health stays green at every track boundary.
4. Per-track ethos audit: origin / offline / locality / self-hostable
   (the same 4-item check the prior plan used).

---

## Sequencing logic

Five tracks, ordered by what unblocks the most downstream work.

```
P1 Platform unblockers     ← gates everything that needs models or new
                             bridge capabilities
   ├── 1A bridge capabilities (3 caps)
   ├── 1B AI model loader (the big one)
   ├── 1C CORS proxy
   └── 1D HRM GATT helper

P2 Tooling                 ← scaffolds and templates that make the
                             rest of the plan ~30% cheaper
   └── 2A `bun run new:showcase <slug>` scaffold

P3 Existing-app pass A     ← cross-cutting, parallel-safe per app:
   └── sensory + intent + UI polish (no AI, no new bridge caps)

P4 New apps                ← parallel by cluster after P2:
   ├── 4A Micro-loggers (5 apps share scaffold)
   ├── 4B Productivity (3 apps; Read-It-Later depends on P1C)
   ├── 4C Memory + social (2 apps)
   └── 4D Daily Briefing (depends on 4A apps existing for intents)

P5 Existing-app pass B     ← AI features (depends on P1B)
   └── Per-app vision/sentiment/classify integrations

P6 Polish + acceptance     ← cross-cluster intent tests, demo cuts
                             per pass, marketplace metadata
```

P1 must happen first. P2–P3 can overlap. P4 starts after P2. P5
starts after P1B. P6 trickles throughout.

---

## P1 — Platform unblockers (sequenced; ~2.5 days)

### P1A — Three new bridge capabilities (~6 hours)

The bridge contract already enforces capability gates and the
intent-broadcast pattern. Adding more capabilities is a known recipe.

#### `apps.list` capability
- **Why:** Habit Tracker auto-suggests habits keyed off intents the
  user's other installed apps declare. Daily Briefing surfaces
  "yesterday in your apps" — needs to know what apps exist.
- **Universal capability** (no permission grant required — it returns
  app names + slugs + declared intents only, never any data).
- **Files:** `packages/app-package-contract/src/index.ts` (cap +
  validator); `packages/iframe-sdk/src/index.ts` (helper); container
  `bridge-handlers.ts` (handler); `+page.svelte` (wire).
- **Definition of done:** an iframe app calls
  `shippie.apps.list()` and gets back
  `[{ slug, name, provides, consumes }, …]`. Tests in
  `app-package-contract` + `container-bridge`.

#### `agent.insights` capability
- **Why:** Per-app insight surfaces inside iframes (e.g. Habit Tracker
  shows "your longest streak is 14 days" in its own UI, not just in
  the container's `InsightStrip`).
- **Permission:** universal (insights are computed from data the agent
  already sees on behalf of the user).
- **Files:** same set as `apps.list`. The `@shippie/agent` package
  already runs at the container level; the new handler just exposes
  `runAgent(...)` results filtered by callerAppId.
- **Definition of done:** `shippie.agent.insights()` returns the list
  of `Insight` objects relevant to that app's slug.

#### `data.transferDrop` capability
- **Why:** Meal Planner needs to accept a recipe drag-dropped from
  Recipe Saver's iframe. HTML5 drag-and-drop doesn't cross frame
  boundaries cleanly; this bridge call brokers the handoff.
- **Pattern:** source iframe calls `shippie.data.transferDrop.start({
  payload, kind })`; destination iframe subscribes via
  `shippie.data.transferDrop.subscribe(handler)`. Container forwards
  payloads between granted iframes.
- **Files:** contract + sdk + handlers + svelte.
- **Definition of done:** drop a `recipe` payload from one showcase
  iframe to another and verify both sides see the right structured
  data.

### P1B — AI model loader (~1 day)

This is the single biggest infrastructure ROI. Unblocks the privacy
story across 6 showcases.

**Today:** `apps/platform/src/lib/container/ai-worker.ts` dispatcher
exists, backend selection (WebNN→WebGPU→WASM) works, but
`@huggingface/transformers` isn't installed so the loader reports
`'unavailable'`.

**Plan:**
1. **Install `@huggingface/transformers`** as a worker-only dependency
   (lazy-loaded; not in the main bundle). ~50KB of glue, ~MB-scale
   model downloads streamed on first use.
2. **Pick model presets** for each task. Decisions and defaults:
   - `embed`: `Xenova/all-MiniLM-L6-v2` (already coded as default)
   - `classify`: `Xenova/nli-deberta-v3-xsmall`
   - `sentiment`: `Xenova/distilbert-base-uncased-finetuned-sst-2-english`
   - `vision` (general): `Xenova/vit-base-patch16-224` (image classify)
   - `vision` (OCR): `Xenova/trocr-base-printed`
   - `whisper` (new task): `Xenova/whisper-tiny` (speech-to-text)
3. **Stream models from `https://models.shippie.app`** (already the
   default). Cache via Cache Storage (already wired in
   `packages/local-ai/src/loader.ts`).
4. **Add `whisper` task** to the worker dispatcher and SDK
   (currently embed/classify/sentiment/moderate/vision).
5. **Verify on a real device** — the WebNN/WebGPU/WASM detection
   needs at least one model run on Chrome (WebGPU) and Safari (WASM).
6. **First-run UX:** when the model isn't cached yet, the first call
   shows progress (the SDK adds an `onProgress` callback).

**Definition of done:** `ai.run('classify', 'recipe', { labels: ['food','drink','tool'] })` returns `{ label: 'food', confidence: 0.92, source: 'local', backend: 'wasm' }` after the first model load (~3-8s) and instantly thereafter.

### P1C — CORS proxy (~1 hour)

Read-It-Later wants to fetch arbitrary URLs and stash the article
locally. CORS blocks it.

**Plan:**
- Route: `apps/platform/src/routes/__shippie/proxy/+server.ts`
- Accepts `?url=<absolute-url>`, refuses non-http(s), follows up to 3
  redirects, caps response size at 5MB, strips Set-Cookie, passes
  through Content-Type, returns `Access-Control-Allow-Origin: *`.
- Optional content sanitisation via Readability.js on the worker
  side (or push that to the client).
- Rate-limited by Cloudflare's built-in rate limiting on the route.

**Definition of done:** Read-It-Later can fetch any public article and
render it offline.

### P1D — HRM GATT helper (~2 hours)

The BLE primitive shipped in Phase 6 handles discovery + scanning.
Heart-Rate Service is `0x180D` with notify characteristic `0x2A37`.

**Plan:** add `pairHrm()` to `packages/proximity/src/ble-beacon.ts`
that returns a `ReadableStream<{ bpm: number, rrIntervalsMs: number[] }>`.
Pure browser primitive, falls back gracefully on unsupported
runtimes.

**Definition of done:** Workout Logger can pair to a real Polar / Wahoo
strap, surfaces live BPM during a session.

---

## P2 — Tooling (~4 hours, after P1A)

### P2A — `bun run new:showcase <slug>` scaffold

10 new apps × 30 minutes of boilerplate per app = 5 hours of pure
copy/paste. Worth investing 4 hours up front to make it 30 seconds
each.

**Plan:**
- Add `scripts/new-showcase.mjs` at repo root
- Reads a template directory, performs slug substitution, creates:
  - `apps/showcase-<slug>/{package.json,tsconfig.json,vite.config.ts,index.html,shippie.json}`
  - `apps/showcase-<slug>/public/{manifest.webmanifest,icon.svg}`
  - `apps/showcase-<slug>/src/{main.tsx,App.tsx,styles.css,bun-test.d.ts}`
  - Picks an unused port from 5191+
- Adds the showcase to `apps/platform/src/lib/container/state.ts`
  curated list (with a TODO for the user to fill specific intents)
- Adds the slug to `apps/platform/src/hooks.server.ts`
  `FIRST_PARTY_SHOWCASE_SLUGS` set
- Adds the seed row to `apps/platform/drizzle/0011_seed_showcase_apps.sql`
  (or a newer migration)

**Definition of done:** `bun run new:showcase widgets` creates a
working iframe-sdk-wired Vite + React showcase that builds, deploys,
and shows in the container — 30 seconds end-to-end.

---

## P3 — Existing-app pass A: sensory + intent + UI polish (~22 hours, parallel-safe)

One commit per app. Each commit makes the same kinds of changes:
1. Wire `@shippie/iframe-sdk` (already done for 6 apps; do it for the
   remaining 5).
2. Fire `feel.texture(...)` on every meaningful state transition
   (save / cooked / completed / error).
3. Broadcast intents the app provides; subscribe to intents it
   consumes.
4. Per-app small UI improvements that don't need AI.

### Per-app to-do list

#### Recipe Saver
- [ ] Cooking-mode timer broadcasts `cooking-now` intent (re-uses
  existing `intent.broadcast`).
- [ ] Mark-cooked button fires `milestone` texture (currently nothing).
- [ ] Subscribe to `pantry-inventory` from Pantry Scanner; render
  ingredients green/red based on what's already in stock.
- [ ] Save button fires `confirm` texture.

#### Journal
- [ ] Wire iframe-sdk.
- [ ] Three-tap entry flow: mood-slider → one sentence → done.
- [ ] Subscribe to `cooked-meal`, `workout-completed`,
  `body-metrics-logged`. When any fire and Journal is open, surface a
  prompt: "How did dinner go?" / "How did the workout feel?".
- [ ] Save fires `complete` texture; mood-slider fires `tap` haptic
  on detent.

#### Whiteboard
- [ ] Wire iframe-sdk.
- [ ] Mesh-only mode by default — when in a Nearby room, drawings
  sync over `@shippie/proximity` Group; alone, fall back to local
  IndexedDB only.
- [ ] Stroke-replay scrubber via the proximity `EventLog`.
- [ ] `navigate` texture on undo, `refresh` on clear, `confirm` on
  stroke commit.

#### Live Room
- [ ] Wire iframe-sdk.
- [ ] Live-latency overlay: each buzzer-press shows ms-since-question
  for that user.
- [ ] Mesh-status badge integration.
- [ ] Crowd-poll integration via the `crowd-poll` primitive.
- [ ] `error` for wrong answer, `milestone` for round winner,
  `install` on session start.

#### Habit Tracker
- [ ] Streak grid — 365-day GitHub-contributions-style render per
  habit.
- [ ] Subscribe to all installed apps' broadcasted intents (after
  P1A's `apps.list`); auto-suggest habits when new providers arrive.
- [ ] Insight strip in the habit detail page (after P1A's
  `agent.insights`).
- [ ] `confirm` texture on tap-check, `milestone` at 7/30/100-day
  streaks.

#### Workout Logger
- [ ] Session timer with rest-period haptics. Set 90s rest → device
  buzzes when up.
- [ ] Subscribe to `sleep-logged`. After 14 days, surface "trained
  18% harder on 7+h sleep nights".
- [ ] Auto-detect workout type via DeviceMotion. Phone-in-pocket →
  "looks like 32-min walk".
- [ ] `error` on overtraining, `milestone` on PRs, `complete` on
  session close.
- [ ] BLE heart-rate pairing (after P1D).

#### Pantry Scanner
- [ ] Camera scan via `BarcodeDetector` (Chrome path; manual fallback).
- [ ] Expiry tracking — store `expiresAt`. Local notification (Web
  Push via the wrapper SDK) when items are 2 days from expiry.
- [ ] `pantry-low` intent broadcast when stock hits 0.
- [ ] `confirm` on scan, `refresh` on inventory update.

#### Meal Planner
- [ ] Subscribe to `cooked-meal` history (already done) — render "you
  cooked Carbonara last Tuesday — schedule again?" suggestions.
- [ ] Smart leftover routing: when servings exceed weekly, propose
  next-week lunch slots.
- [ ] `spring-transition` on slot fill, `complete` when full week
  is planned.
- [ ] Drag-and-drop from Recipe Saver (after P1A's
  `data.transferDrop`).

#### Shopping List
- [ ] Multi-phone mesh sync via `@shippie/proximity` Group when in a
  Nearby room.
- [ ] Cross-off haptic + line-through transition.
- [ ] `needs-restocking` intent broadcast.
- [ ] `tap` on each cross-off, `milestone` when list is complete.

#### Sleep Logger
- [ ] Render correlation as a scatter plot (locally drawn SVG, no
  charting lib).
- [ ] Sleep-debt running average (last 7 nights vs target).
- [ ] Subscribe to `caffeine-logged` (will work once Caffeine Log
  ships in P4A).
- [ ] `error` on sub-5h night, `milestone` on 7-night streak of 7+h.

#### Body Metrics
- [ ] Photo time-lapse: scrub a slider through stored photos
  chronologically.
- [ ] Privacy ribbon at top: "Photos stored locally only. No upload
  path exists. github.com/…/photo-store.ts" with link to actual code.
- [ ] `body-metrics-logged` intent broadcast.
- [ ] `complete` on log, `error` if storage near quota.

---

## P4 — New apps (~50 hours, parallel by cluster)

Use the P2A scaffold for each.

### P4A — Micro-loggers (5 apps × ~3 hours = 15 hours)

Each is a one-screen "tap to log" app. They share a pattern: one
button, one local IndexedDB row, one intent broadcast, one micro
chart.

| Slug | Provides | Consumes | One-line |
|---|---|---|---|
| `caffeine-log` | `caffeine-logged` | — | Single tap to log a coffee/tea. |
| `hydration` | `hydration-logged` | `cooked-meal` | Daily water target. |
| `mood-pulse` | `mood-logged` | `caffeine-logged`, `workout-completed`, `sleep-logged` | 3-second mood tap; correlations. |
| `symptom-tracker` | `symptom-logged` | — | Aches, allergies, headaches with severity. |
| `steps-counter` | `walked` | `workout-completed` | DeviceMotion-based step count, doesn't double-count gym. |

### P4B — Productivity (3 apps × ~6 hours = 18 hours)

| Slug | Notes |
|---|---|
| `pomodoro` | 25/5 cycle; `feel.texture('navigate')` on phase transition; `focus-session` intent broadcast on completion. |
| `read-later` | Paste URL → fetch via `/__shippie/proxy?url=` (P1C) → store HTML locally → render via Readability.js in-iframe. Subscribes to `mood-logged` for mood-based suggestions. Capability: offline reader, no Pocket account. |
| `daily-briefing` | After P4A apps land. Subscribes to ~9 intents. Renders one screen at 8am: "yesterday in your apps." Uses `agent.insights` (P1A) and consumes everything. |

### P4C — Memory + social (2 apps × ~6 hours = 12 hours)

| Slug | Notes |
|---|---|
| `restaurant-memory` | Where you ate, what you had, with whom. Photos in IndexedDB. Subscribes to `cooked-meal` to compute home-vs-out ratio. Provides `dined-out`. |
| `show-and-tell` | Mesh-only ephemeral scratchpad. Anyone in a Nearby room drops photo/link/text into a shared canvas. Auto-clears when room empties. No persistence. Capability: AirDrop replacement that crosses platforms. |

---

## P5 — Existing-app pass B: AI features (~25 hours, depends on P1B)

Each AI feature gets a flag — falls back gracefully when the model
fails to load.

| App | Feature | Model |
|---|---|---|
| Recipe Saver | Photo → ingredients OCR | TrOCR |
| Recipe Saver | Photo → "what dish is this?" | ViT |
| Journal | Sentiment-arc sparkline (after 14 entries) | DistilBERT |
| Journal | Voice-note transcription | Whisper-tiny |
| Whiteboard | Shape recognition (rough rectangle → clean) | ViT or custom CNN |
| Pantry Scanner | Photo-to-item identification (no barcode) | ViT |
| Shopping List | Item-by-aisle classifier | DeBERTa-xsmall (zero-shot classify) |
| Body Metrics | Body-fat % estimate (heavily disclaimed) | ViT or bespoke vision model |

**Pattern per integration:**
1. Showcase calls `shippie.ai.run({ task, input })` via the iframe-sdk.
2. Surface a "first-run download" progress UI on initial use.
3. Cache hit on subsequent calls — instant.
4. If `source: 'unavailable'`, render a fallback UI ("AI features
   loading… or unavailable on this browser").

---

## P6 — Polish + acceptance (~12 hours, throughout)

### P6A — Cross-cluster intent acceptance tests

Every new intent gets a vitest in
`apps/platform/src/lib/container/intent-broadcast.test.ts` style:
provider broadcasts → consumer receives → asserts row content.

New intents introduced by this plan:
`cooking-now`, `pantry-inventory` (broadcast added),
`pantry-low`, `caffeine-logged`, `hydration-logged`,
`mood-logged`, `symptom-logged`, `walked`, `dined-out`,
`focus-session`, `read-saved`, `sleep-debt-high`,
`body-metrics-logged`, `journal-entry-added`,
`workout-completed-detail` (HR/cadence variant).

### P6B — Per-pass demo recordings

After each P3 / P4 / P5 lands, record a 30s vignette via the existing
Playwright recording tool (`tools/recording`). Cumulative cuts:
- After P3: a 60s "every existing app got cross-app + sensory"
- After P4A: "log everything in 3 taps"
- After P4B: "Pomodoro + Read-It-Later + Daily Briefing"
- After P4D: "Daily Briefing" hero shot
- After P5: "AI runs on your phone"

The 2-min C2 master cut from `docs/launch/c2-demo-storyboard.md`
gets re-cut at the very end.

### P6C — Marketplace metadata

Each new app:
- Real `tagline` and `description` in `0011_seed_showcase_apps.sql`
  pattern (or a follow-up `00XX_seed_more_apps.sql`).
- Better category (current values are hand-picked; review against
  the marketplace's existing categories).
- An `icon.svg` that's visually distinct from siblings.
- Manifest `categories` field to align with the marketplace browse
  filters.

### P6D — Showcase catalog refresh

`packages/templates/src/showcase-catalog.ts` currently knows about
the 8 demo apps. Update it to know about all 21 (11 existing + 10
new) so the cross-cluster acceptance test surface stays
authoritative.

---

## Cross-cutting patterns

### Reuse

| Pattern | Where |
|---|---|
| Tap-to-log micro-app | P4A — 5 apps share scaffold + 1-button UI + IndexedDB row + intent broadcast |
| Photo + IndexedDB privacy showcase | Body Metrics, Restaurant Memory |
| Cross-app correlation (subscribe to N intents) | Mood Pulse, Sleep Logger, Daily Briefing, Habit Tracker |
| Mesh-aware collaboration | Whiteboard, Shopping List, Show & Tell |
| AI-on-device privacy showcase | Recipe Saver, Journal, Whiteboard, Pantry Scanner, Body Metrics |

### Things that simplify the plan, not the scope

1. **iframe-sdk consolidation** — already shipped. Every new app uses it; every existing app gets migrated in P3.
2. **The new-showcase scaffold (P2A)** — saves ~30 minutes per app × 10 = 5 hours.
3. **Single-pass platform unblockers (P1)** — three bridge caps in one commit, model loader in one, etc. Avoids context-switch tax.
4. **Feature flags on AI-dependent features** — let P5 ship even before all models load on every device.

---

## Acceptance criteria

The plan is done when:

1. **Every app demonstrates a specific Shippie ideology claim** stated in code (the `proves` field on `@shippie/templates`'s catalog entries).
2. **`bun run smoke` passes** the cross-cluster acceptance with all 21 apps installed and three intent flows verified end-to-end (e.g. cooked-meal → habit auto-check, mood-logged → daily briefing surfaces, pantry-low → shopping list adds item).
3. **Health stays green** at every track boundary.
4. **Production deploy at `shippie.app/container` shows all 21 apps.**
5. **Real-device walkthrough** verifies AI runs on iOS Safari + Android Chrome, mesh works between two real phones, and the Add-to-Home-Screen flow lands cleanly.

---

## Critical path

If only one person works on this:

```
P1B (1d) → P2A (4h) → P4A (15h) → P4D (8h) → P5 Recipe Saver (4h)
                                                    ↓
                                              demo recording
```

That's ~3 days of focused work for the *minimum demonstrable
slice*: AI loader works → scaffold ready → 5 micro-loggers live →
Daily Briefing renders → at least one AI feature visible. After that,
P3 + remaining P4/P5 land in any order.

If two or more people:
- Person A: P1 → P5 (AI track)
- Person B: P2 → P3 → P4 (apps track)
- Both converge for P6.

---

## What this plan deliberately does NOT do

- **Native shell graduation for the showcases.** The `shippie graduate`
  CLI we shipped in Phase 6 covers the path; actual Capacitor wraps
  for showcases stay deferred until a maker asks (per CLAUDE.md
  Phase 6 deferral principle).
- **A real Pages-per-app deployment.** Option-3 from the URL-strategy
  decision stays — `/run/<slug>/` is the canonical URL.
- **iOS-only PWA install flows per app.** The container is the install
  surface; per-app subdomain installs would require Option 1 from the
  same URL-strategy decision and are deferred.
- **The remaining Phase 6 items** (hotspot handoff, stadium pilot,
  cross-LAN federation real-hardware testing, OS dissolution) — same
  Phase 6 deferral as before.

---

## Suggested next action

Ship P1 in a single coherent commit (3 caps + model loader + CORS
proxy + HRM helper). It's ~2.5 days but the rest of the plan unlocks
behind it. The minute P1 lands and `bun run health` is green, every
other track can move in parallel.

I can start P1 right now if authorised. Otherwise this doc is the
brief and the rest is sequencing.
