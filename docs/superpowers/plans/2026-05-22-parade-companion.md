# Parade Companion — Implementation Plan (v2)

> **For agentic workers (codex):** Build-ready plan for `apps/showcase-parade-companion` in `/Users/devante/Documents/Shippie`.
> Read every file path it tells you to read **at HEAD** before writing code — the repo's own rule: "subagent reports are leads, not oracles."

**Goal:** An offline-first Shippie showcase for Arsenal's victory parade — map, group meet-up plan, safety/transport info — that works flawlessly with zero connectivity for an unbounded crowd, with bus tracking and group tracking layered on as honest, clearly-labelled extras.

**Architecture:** A 100% static PWA whose **core makes zero network requests** after first load. Offline is guaranteed by the platform's existing service worker + the `runtime_assets` precache mechanism — not a custom SW. The route pack is **baked** into the bundle. Bus and group tracking are *opt-in networked layers* built on the Shippie relay; they never sit on the offline critical path.

**Tech Stack:** Vite + React 19 + TypeScript; `@shippie/showcase-kit` (`mountShowcase`) + `@shippie/showcase-kit-v2` (`QrShareSheet`); the container-injected `window.shippie.local.db` global; `bun test`.

**Design:** The visual look & feel is fully specified in the companion doc **`2026-05-22-parade-companion-design.md`** (design tokens, typography, component CSS, screen mapping) — built from the user's Claude Design work in `parade-design-source/`. Apply it to every screen. Two design fixes are load-bearing for offline: self-host the fonts, and hardcode no dates.

---

## Changelog v1 → v2

- **All five Codex findings verified against repo HEAD and fixed** (Part 1).
- **Custom service worker removed.** Offline now rides the platform SW + `shippie.json#runtime_assets` (Part 8) — the proven "100% offline" path. This deletes Task 2's `gen-precache.mjs` / Vite-plugin entirely.
- **Route pack is now baked, not fetched.** Resolves Codex P1; makes "zero network in parade mode" architecturally true, not aspirational (Part 7).
- **No top-level `@shippie/sdk` import** — it auto-boots a runtime and fetches `/__shippie/meta`. Use `window.shippie.local.db` (container-injected) instead (Part 8).
- **Start time corrected to 14:00 BST** (2pm). **Launch copy "tomorrow" → "on parade day."**
- **Added bus tracking** (Part 9) and **group tracking** (Part 10) — designed honestly, staged so neither can endanger the offline core.

**v2.1 (user decision — "build everything"):** all rungs are now committed parade-day scope, not optional. Bus Pulse (9c) and the group relay (Rung 1) ship for 31 May. The build is split into two parallel tracks (Part 11) so the networked layers never delay the offline core — which is still built and verified **first** as the guaranteed floor. Pure browser-only LAN mesh (Rung 2) stays a research spike: its feasibility is genuinely unproven and gets no deadline; the buildable "one anchor with signal" form of Rung 2 is committed and falls out of the Rung-1 relay client for free.

---

## Part 1 — Codex findings: verified and resolved

I read the cited files at HEAD. **All five findings are valid.** Resolutions:

| # | Finding | Verified at | Resolution |
|---|---|---|---|
| P0 | Start time wrong (13:00 vs 2pm BST) | Islington confirms 2pm | `event.startTime` = `2026-05-31T14:00:00+01:00`; `scheduleEstimate` times shifted accordingly. |
| P0 | Precache step skipped in production | `prepare-showcases.mjs:145` runs `bunx vite build --base=…` directly — any `package.json` post-build step never runs | **Drop the custom precache step entirely.** Use the platform's `runtime_assets` mechanism (Part 8). |
| P1 | Offline test target unrealistic | Showcases are **iframed** at `/__shippie-run/<slug>/` inside the `/run/<slug>/` shell; a platform PWA SW handles it | Test the real `/run/parade-companion/` path inside the platform shell, in airplane mode — not `vite preview` (Part 12). |
| P1 | Top-level `@shippie/sdk` import breaks "zero requests" | `packages/sdk/src/index.ts:123` auto-boots install runtime; `:175` does `fetch('/__shippie/meta')` | Never import `@shippie/sdk` at top level. Use `window.shippie.local.db` (injected by `prepare-showcases.mjs`'s bridge script). Mirror `showcase-match-room` (plain `localStorage` + `window.shippie`). |
| P1 | Live route-pack wording loose / cross-origin | Platform SW passes cross-origin through uncached; arcade CSP `connect-src` is `'self'` + `wss://*.shippie.app` only | **Bake the route pack.** No runtime fetch in v1. Updating the route = edit the file + redeploy (Part 7). |
| P2 | Launch copy says "tomorrow" | Post goes out Thu 28 May for Sun 31 May | Copy → "set it up before you go… it works on parade day" (Part 13). |

**The bigger discovery behind P0:** the platform already solves showcase offline. `prepare-showcases.mjs` emits a per-showcase `__shippie-assets.json` manifest (walks the whole `dist/` tree, so the basemap is included automatically), and `runtime_assets` in `shippie.json` forces heavy assets into the SW install precache — the same path that gives Chess its "solo path 100% offline" gate. **We do not write a service worker.** We declare assets and let the platform guarantee them. Less code, less risk, aligned with the platform.

---

## Part 2 — Product definition & the capability ladder

A **Local Tool** (per `docs/strategy/local-tools-policy.md`) deployed at `/run/parade-companion/`. Used by a fan to prepare for and survive a multi-million-person parade where phones have no signal.

**Honesty principle (load-bearing):** every piece of data the app shows carries its *source* and its *age*. A position is labelled "live", "8 min ago", or "planned spot" — never an undated dot. Showing a stale location as if live is a safety hazard in a crowd; it is not allowed anywhere in the UI.

The app is built as a **graceful-degradation ladder** — it always shows something useful, and always tells you which rung you are on:

| Rung | Works when | Powers |
|---|---|---|
| **0 — Offline core** | Always, zero signal | Your own GPS dot, the map, the route, safety/transport info, the group **plan** (meeting points + compass), the bus **schedule estimate**, your own "bus passed me" markers |
| **1 — Opportunistic relay** | Any member catches any signal | Group members' last-known positions; crowd bus sightings ("Bus Pulse") |
| **2 — Local mesh (research)** | Group on a shared phone hotspot | Friends' live positions with no internet, ~30 m range |

**All three rungs are committed parade-day scope.** Rung 0 (the offline core) is built **first** — it is the foundation every other rung renders on top of, and the guaranteed floor if time runs short. Rungs 1–2 are built on a parallel track (Part 11) and may never block, slow, or break rung 0.

**Screens:** Ready · Map · Plan · Meet · Safety & Transport · Group.
**Out of scope:** photo wall, ultrasonic/BLE beacons, and pure browser-only LAN mesh (an unbounded research problem — see Part 10).

---

## Part 3 — The "flawless for millions" principle

**The offline core has no server interaction at all after first load.** Concurrency is therefore a non-issue for it: 2 million phones run cached code independently. The only night-before server load is static asset delivery from Cloudflare's CDN — trivial at any scale.

**The networked layers scale by sharding, not by a big system.** There is no global broadcast. Each friend group is an independent room → one Cloudflare Durable Object per group, ~5–8 members, ~50-byte position updates throttled to ≤1 per 30 s. 2 million people ≈ 300k tiny independent rooms with no shared bottleneck. "Works for millions" is true *because* it is millions of isolated islands, not one network. This is the pioneering property — and it is also why it degrades gracefully: kill the relay and every group still has rung 0.

**Hard rules:**
- v1 core makes **zero** network requests. Provable: DevTools Network panel empty on the Map/Meet screens offline.
- Networked code (Parts 9–10) is lazy-loaded, fire-and-forget, with short `AbortController` timeouts. If the relay is unreachable the UI is visually unchanged.
- Total precached payload target **< 30 MB** (iOS storage headroom); the basemap is the only heavy asset — keep it lean.

---

## Part 4 — Repository conventions (read at HEAD first)

**Read these two design files before writing any UI — they are not optional:**
- `docs/superpowers/plans/2026-05-22-parade-companion-design.md` — the design system: tokens, typography, the production `styles.css`, component recipes, screen mapping. Every screen must use it.
- `docs/superpowers/plans/parade-design-source/` — the user's original Claude Design work (`index.html`, `screens/*.jsx`, `design-chat.md`). Recreate the visual output; don't copy the prototype's inline-style structure.

Repo conventions:
- `apps/showcase-match-room/` — closest sibling. Note: `src/main.tsx` (mount + the PROD SW-registration block — **we will not register our own SW**, see Part 8), `src/shared/local-store.ts` (uses plain `localStorage`, no `@shippie/sdk` import), and `src/shared/{relay-gossip,signal-config,peer-id,crypto}.ts` (existing relay/gossip building blocks — relevant to Parts 9–10).
- `templates/showcase-template/` — scaffold baseline.
- `apps/platform/scripts/prepare-showcases.mjs` — how showcases build/copy; `runtime_assets` collection (~lines 311–365); the `window.shippie.local.db` bridge (`runtimeLocalBridgeScript`, ~line 240).
- `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — the platform SW: cache-first for immutable assets, precaches `SHOWCASE_PRECACHE` + `RUNTIME_PRECACHE` at install.
- `apps/showcase-chess/shippie.json` — reference for `curation.surface` + (if present) `runtime_assets`.
- `apps/platform/src/lib/curation/arcade-csp.ts` — CSP injected for `surface: "arcade"`: `connect-src 'self' wss://shippie.app wss://*.shippie.app`.
- `packages/showcase-kit-v2/src/qr-sheet/` — `QrShareSheet.tsx`, `encode-fragment.ts` (reuse for plan sharing).
- `apps/showcase-chiwit/src/styles.css` — reference skin for `@shippie/showcase-kit-v2` CSS classes.
- `docs/strategy/local-tools-policy.md` — deploy-scanner rules.

---

## Part 5 — File structure

```
apps/showcase-parade-companion/
  shippie.json                 # manifest incl. runtime_assets (Task 1, Part 8)
  package.json tsconfig.json vite.config.ts index.html
  public/
    icon.svg                   # generic red, no crest
    manifest.webmanifest
    basemap/corridor.webp       # pre-rendered Web-Mercator raster of the corridor
    route-pack.json             # BAKED route pack (the only copy in v1)
  src/
    main.tsx                    # mountShowcase ONLY — no SW registration
    App.tsx                     # shell + bottom-nav, date-aware default screen
    styles.css                  # app skin INCLUDING the .shippie-qr-sheet block
    data/parade-2026.ts         # CORRIDOR_EXTENT + typed default route pack
    lib/
      geo.ts route-pack.ts group-plan.ts compass.ts gps.ts
      bus.ts                    # local "bus passed me" markers (rung 0)
      shippie-db.ts             # thin typed wrapper over window.shippie.local.db
    screens/
      ReadyScreen.tsx MapScreen.tsx PlanScreen.tsx MeetScreen.tsx SafetyScreen.tsx
    components/
      CorridorMap.tsx Disclaimer.tsx
  src/lib/{geo,route-pack,group-plan,bus}.test.ts
```

Networked layers (Parts 9–10) add `src/lib/relay.ts`, `src/lib/group-room.ts`, a `src/screens/GroupScreen.tsx`, and a separate platform-side Worker — kept out of the core bundle's load path.

---

## Part 6 — v1 core build tasks

> Commit per task. Repo-root health gate (`bun run typecheck && bun run test && bun run build`) stays green. **Do not commit to `main`** — stage and let the user commit (`CLAUDE.md`).

### Task 1 — Scaffold

- [ ] Copy `templates/showcase-template/` → `apps/showcase-parade-companion/`.
- [ ] `package.json`: name `@shippie/showcase-parade-companion`; deps `@shippie/showcase-kit`, `@shippie/showcase-kit-v2`, `react`, `react-dom`. **Do not add `@shippie/sdk`** (Part 8).
- [ ] `shippie.json`: `name` "Parade Companion — Islington", `short_name` "Parade", `slug` "parade-companion", `start_url`/`scope` `/run/parade-companion/`, `theme_color` a generic red, `intents` empty, `data_schemas` with the `group_plan` and `bus_marker` tables, `curation.surface` per Part 8, `license` "AGPL-3.0-or-later". Add `runtime_assets` per Part 8.
- [ ] `manifest.webmanifest`: mirror match-room with `/run/parade-companion/` ids.
- [ ] `src/main.tsx`: `mountShowcase(<App/>, { manifest })` only — **delete the SW-registration block** match-room has.
- [ ] If `prepare-showcases.mjs` / a catalog needs a registry entry for new showcases, add it (check `CLAUDE.md` "Dev environment gotchas").
- [ ] Verify: `bun run typecheck && bun run build` pass; `bun run dev` serves a placeholder.

### Task 2 — Offline guarantee via the platform (no custom SW)

- [ ] Read `prepare-showcases.mjs` ~311–365 (`collectRuntimeAssets`) and `apps/showcase-chess/shippie.json`. Determine the exact `runtime_assets` key format and whether it is honored for non-arcade surfaces.
- [ ] Set `shippie.json#runtime_assets` to the heavy must-be-offline assets — `basemap/corridor.webp` and `route-pack.json` — so the platform SW precaches them at install.
- [ ] **If `runtime_assets` is arcade-gated:** either set `curation.surface: "arcade"` (accept arcade-shelf placement + the arcade CSP — which suits us: it allows `connect-src 'self'` + `wss://*.shippie.app`), **or** keep `surface: "utilities"` and rely on first-online-load runtime caching by the platform SW (acceptable because our launch flow is "open once on Wi-Fi before you go"). Pick one, record the reason.
- [ ] Confirm the basemap appears in the generated `__shippie-assets.json` for this slug after `bun run prepare:showcases`.
- [ ] Do **not** add `public/sw.js`. The platform SW is the offline mechanism.
- [ ] Verify: see Task 9's real-path airplane-mode test.

### Task 3 — Basemap + geo + map component

- [ ] Pre-render `public/basemap/corridor.webp`: a **Web Mercator** raster of a generous central-Islington bbox (Emirates / Drayton Park / Holloway Rd / Upper St / Town Hall / Highbury & Islington + Angel, plus ~1 km margin). < 6 MB. Show "© OpenStreetMap contributors" (ODbL).
- [ ] `data/parade-2026.ts`: `CORRIDOR_EXTENT` `{ west,east,north,south,pxWidth,pxHeight }` matching the raster.
- [ ] `lib/geo.ts` (TDD): `lngLatToPixel` (Web-Mercator Y: `ln(tan(π/4+lat/2))`), `pixelToLngLat`, `haversineMeters`, `bearingDeg`. `geo.test.ts` first: known landmark → expected pixel; known distance; due-north bearing ≈ 0.
- [ ] `components/CorridorMap.tsx`: raster layer + absolutely-positioned `<canvas>` overlay (route polyline, POIs, GPS dot + accuracy circle, group/bus markers later). Pinch-zoom/pan clamped to the extent. No map library.

### Task 4 — GPS + Map screen

- [ ] `lib/gps.ts`: `watchPosition` wrapper (`enableHighAccuracy`, `maximumAge:10000`, `timeout:30000`), `warmUp()` one-shot, battery-saver polling mode, always exposes `coords.accuracy`.
- [ ] `screens/MapScreen.tsx`: GPS starts on mount, stops on unmount; dot + accuracy radius; distance to route + nearest POI; no-fix guidance ("Turn on Location — airplane mode is fine, keep Location on"); battery-saver toggle.
- [ ] Verify on a real phone, airplane mode + Location on.

### Task 5 — Route pack (baked)

Schema v1 — see Part 7. `event.startTime` = `2026-05-31T14:00:00+01:00`.

- [ ] `public/route-pack.json`: a complete **baked** pack with everything known on 22 May. `route.coordinates` may be `[]` with `event.status:"route-tbd"`.
- [ ] `lib/route-pack.ts` (TDD): `validateRoutePack(json)` (schemaVersion, required fields, coords inside `CORRIDOR_EXTENT`; returns `null` on failure) and `loadRoutePack()` (reads the baked file; on validation failure falls back to a minimal hard-coded default — a malformed hand-edit must never blank the app).
- [ ] No network fetch. Updating the route = edit `route-pack.json`, re-run `prepare:showcases`, redeploy.
- [ ] Verify: `bun test src/lib/route-pack.test.ts`; app loads fully offline.

### Task 6 — Safety/Transport + Ready screens

- [ ] `screens/SafetyScreen.tsx`: renders `safety`, exit/medical/toilet POIs, station status (colour-coded), closures, step-free routes out, plus static crowd-safety guidance. Every block cites `sources` + `packVersion`.
- [ ] `screens/ReadyScreen.tsx`: big unmissable "✅ Ready — saved to your phone" / "⚠️ Open on Wi-Fi to finish saving"; runs an offline-readiness check (caches present); "Add to Home Screen" guidance via `window.shippie.install` if available; `gps.warmUp()`; route-pack `packVersion` display.
- [ ] `components/Disclaimer.tsx`: persistent "Unofficial · fan-made · not affiliated with Arsenal Football Club or Islington Council."

### Task 7 — Group plan (Plan) + Meet screen

GroupPlan: `{ v:1, name, members[], primary{label,lng,lat,time?}, fallback{label,lng,lat}, ifSeparated, leavePlan?, note? }`.

- [ ] `lib/shippie-db.ts`: typed wrapper over `window.shippie.local.db` (`group_plan`, `bus_marker` tables); feature-detects the global, no-ops gracefully if absent in dev.
- [ ] `lib/group-plan.ts` (TDD): `encodePlan`/`decodePlan` using `packages/showcase-kit-v2/src/qr-sheet/encode-fragment.ts`; compress; keep encoded payload < ~1 KB for reliable QR; reject oversized/tampered/wrong-version → `null`. Round-trip test first.
- [ ] `screens/PlanScreen.tsx`: create/edit a plan, pick points by tapping the map or from `meetingLandmarks`; share via `QrShareSheet` **and** a copyable `#fragment` link (fragments never reach a server — state this). Import = open link → `decodePlan` → confirm → save. State plainly: the plan is a **snapshot**; re-share if changed.
- [ ] `lib/compass.ts`: `deviceorientation` / `webkitCompassHeading`; iOS `requestPermission()` from a user gesture; degrades gracefully.
- [ ] `screens/MeetScreen.tsx`: meeting points with offline countdown timers; a large compass **arrow** to the next point (`bearingDeg` from GPS + heading) + straight-line distance; a high-contrast "My location card" (coords + nearest landmark) to show a steward.
- [ ] Add the `.shippie-qr-sheet` skin block to `styles.css` (re-paletted from `showcase-chiwit/src/styles.css`) — **required** by the `CLAUDE.md` kit invariant.

### Task 8 — Shell, navigation, field UX

- [ ] `App.tsx`: bottom-nav across the screens; date-aware default (before 31 May → Ready; on 31 May → Map) with a "Today's the day" banner.
- [ ] Field UX: ≥44 px targets, sunlight-legible high contrast, one-handed bottom nav, large type; `navigator.vibrate` haptics on key actions; safe-area insets.

### Task 9 — Self-review, health gate, real-path test, deploy

- [ ] Run Part 14 self-review; repo-root health gate green.
- [ ] **Real-path offline test:** build + `prepare:showcases` + run the platform; install the Shippie PWA; open `/run/parade-companion/` **once online**; enable airplane mode (Location on); fully close and reopen — the app and basemap load, DevTools Network shows **zero successful requests** on Map/Meet.
- [ ] Deploy-scanner pass (the baked app has no external fetch, no auth/trackers/ads — clean).
- [ ] Deploy via the platform pipeline (`prepare:showcases` → build → `wrangler deploy`; obey the `CLAUDE.md` generator→build→deploy ordering).

---

## Part 7 — Route pack (baked) and freshness

Schema v1: `schemaVersion`, `packVersion` (ISO + the human "updated" stamp), `event{title,dateLabel,startTime:"2026-05-31T14:00:00+01:00",status}`, `sources[]`, `route{type:"LineString",coordinates}`, `pois[]{id,kind,name,lng,lat,note}`, `closures[]`, `transport{stations[]{name,status,note},stepFreeRoutesOut[]}`, `meetingLandmarks[]`, `safety[]{heading,body}`, `scheduleEstimate[]{label,time}` (e.g. "Parade starts at the stadium — 14:00").

Baked = the route pack ships inside the bundle; there is **no runtime fetch** in v1. Freshness UX: always show "Parade info as of {packVersion}". Because the platform SW is versioned per deploy, a user who opens online after a redeploy automatically gets the latest pack. The launch copy tells people to open on Wi-Fi before they go — that is when they pick up the final route.

*Updating the route:* edit `public/route-pack.json` → `bun run prepare:showcases` → redeploy. A Cloudflare redeploy is minutes; a final push the night before / morning of 31 May is fine. *(Optional v1.1: a same-origin platform KV endpoint for redeploy-free updates — only if late changes prove painful.)*

---

## Part 8 — Offline mechanism, SDK access, iOS

**Offline:** the platform SW + `shippie.json#runtime_assets` (Task 2). We register no SW. The basemap + baked route pack are declared as runtime assets so a fresh install precaches them; ordinary JS/CSS is runtime-cached by the platform SW on the first (online) open. Our launch flow — "open once on Wi-Fi before you go" — means first open is always online.

**SDK / local DB:** never `import { shippie } from '@shippie/sdk'` at top level — it auto-boots a runtime and fetches `/__shippie/meta`. Use the container-injected **`window.shippie.local.db`** global (injected into `index.html` by `prepare-showcases.mjs`; a `postMessage` bridge to the parent, no network). Wrap it in `lib/shippie-db.ts`. For install prompts use `window.shippie.install` if present (feature-detect). Haptics via `navigator.vibrate`. This mirrors `showcase-match-room`.

**iOS:** iOS can evict SW caches after ~7 days idle → tell users to set up close to parade day; the Ready screen re-verifies on each online open. Steer users to **Add to Home Screen** (most reliable offline container) with explicit Safari steps. Compass needs `DeviceOrientationEvent.requestPermission()` from a user gesture. GPS works in airplane mode with Location Services on — verify per device.

**Compliance:** v1 core declares `worksOffline`, `localDb`; no external fetch, no auth, no trackers, no ads → deploy-scanner clean. The networked layers (Parts 9–10) additionally declare `privateRelay` and surface the disclosed connection.

---

## Part 9 — Bus tracking

The bus has no public live GPS feed. Three honest layers, weakest-to-strongest dependency:

**9a — Schedule estimate (rung 0, in v1 core).** `route-pack.json#scheduleEstimate` drives a static "expected near you ~14:40" line, labelled "estimated, not live." Zero infrastructure. Always available.

**9b — "Bus passed me" personal marker (rung 0, in v1 core — Task added below).** A tap that pins time + your GPS locally (`bus_marker` table). Pure offline, no network. Feeds a personal recap ("the bus reached you at 14:43") and is the *input* for 9c. Cheap (~half a day).

- [ ] **Task 7b:** `lib/bus.ts` — `recordSighting(kind, position)` writes a `bus_marker` row; `listSightings()`; snap each sighting to the nearest `route` segment via `geo.ts`. `bus.test.ts`: segment-snapping correctness. A "🚌 Bus is here" button on the Map screen; show the user's own markers on the map.

**9c — Bus Pulse crowd wave (rung 1, committed — Track B).** Codex's design, adopted with two added constraints. When a member taps "bus here" *and* has signal, a minimal anonymous packet (`{segmentId, kind, accuracyM, createdAt}` — no coordinates, no device ID, no trail) goes to a Shippie endpoint. The map route **glows by segment** (grey → amber possible → red confirmed cluster → faded passed) — a confidence wave, never a fake moving dot. Constraints: (1) it is lazy-loaded and never on the Map render path — if the endpoint is unreachable the map is unchanged; (2) anti-spam via Cloudflare edge IP rate-limiting (no stored device ID) + require 3+ clustered sightings + 8-min decay; show counts and age, never individual reports. Backend: one small Cloudflare Worker + a Durable Object (ingest + an edge-cached aggregate read), built on Track B (Part 11).

---

## Part 10 — Group tracking: the honest design

**The hard truth, stated plainly.** "WhatsApp live location, but for everyone, with no internet" is not buildable — and not because of code. For phone B's position to reach phone A, the bits must physically travel. The only transports a *browser* can use are cellular/Wi-Fi (dead at the parade) and, on Android only, short-range Web Bluetooth (no peripheral/advertise mode — no real mesh; unavailable on iOS Safari entirely). There is no radio in the sandbox that bridges a mile of signal-dead crowd. Even Apple's Find My only works by piggybacking on *internet-connected* bystander phones — at a parade where everyone's internet is dead, it degrades too. The repo's own `CLAUDE.md` defers exactly this: "Phase 6 — Spark phone-to-phone propagation, BLE beacon, multi-Hub stadium mesh."

So we do not promise route-wide realtime. We build the **honest** version — and the honest version is genuinely pioneering, because nobody else ships a *serverless, account-free, infrastructure-free group tracker that degrades gracefully*:

**Rung 0 — The Plan (already in v1, the Meet screen).** Pre-agreed meeting points + a compass arrow + countdowns. No transport needed. This is what actually reunites people in a dead-signal crowd; "live tracking" is a convenience on top, not the solution.

**Rung 1 — Opportunistic group relay (the realistic "realtime").** A group is a **room** identified by a code shared at home (QR/link, like the plan). Each member's app, *whenever it catches any signal*, pushes its own `{lat,lng,accuracy,at}` to the room's Durable Object over `wss://*.shippie.app` (allowed by the CSP) and pulls the others'. Positions are encrypted (the repo's `crypto.ts`), tiny, throttled to ≤1/30 s. Members see each other's dots **with an explicit age** — "live", "2 min", "14 min ago". The **bus is just another room member**, its position set by 9c sightings or an organiser beacon. This scales to millions because it is hundreds of thousands of independent ~6-member rooms — no global broadcast, one DO each (Part 3).

**Rung 2 — Local hotspot mesh (research / next-event).** When a group is on one member's phone hotspot, members exchange positions peer-to-peer over the LAN with *no internet at all*. This is the genuine offline-realtime tier. It is hard in a browser (WebRTC needs signalling; LAN-local signalling is unsolved here) and the repo has deferred it. Treat it as a research spike, not a parade-day commitment. The pragmatic 80% version: **"one anchor with signal"** — if any one group member has intermittent cellular, that phone relays the whole group to/from the Shippie relay; everyone else syncs through it. That collapses rung 2 into rung 1 and is buildable.

**Non-negotiable UI rules for group tracking:**
- Every dot shows source + age. A position older than ~3 min is visually de-emphasised; older than ~15 min is shown as "last seen", not a live dot.
- The Map/Meet screens render identically whether the relay is up or down — group data is an optional overlay.
- The relay is opt-in per group, disclosed ("Private relay via Shippie — encrypted, Shippie can't read it"), and declared as the `privateRelay` capability.

**Staging (decided — "build everything"):** all rungs are committed for parade day. The offline core (rung 0) is built **first** as the foundation and guaranteed floor; rung 1 is built in parallel on Track B (Part 11). Rung 2's pure browser-only LAN mesh stays a research spike — its feasibility is genuinely unproven and gets no deadline — but its buildable **"one anchor with signal"** form (if any one member has intermittent cellular, that phone relays the whole group) falls out of the Rung-1 relay client for free and is committed.

Rung-1 build (Track B tasks B1–B5, Part 11): `src/lib/relay.ts` (wss client, reconnect, throttle, abort), `src/lib/group-room.ts` (room code, membership, encrypted position encode/decode — reuse `match-room/src/shared/{crypto,peer-id,relay-gossip}.ts`), `src/screens/GroupScreen.tsx` (room create/join, the live map overlay with per-dot ages), and a platform-side Worker + Durable Object (`apps/platform/...`) for the per-room relay. All lazy-loaded; none of it imported by the core screens.

---

## Part 11 — Schedule: two parallel tracks (today = 22 May, parade = Sun 31 May)

"Build everything" in 9 days is only feasible because the offline core (UI/client) and the networked backend (Cloudflare Workers/DOs) are largely independent. Run them as **two tracks** — ideally two implementer agents (the user's parallel-dispatch pattern; brief each to commit per-deliverable). **Track A is the critical path and the guaranteed floor; Track B may never delay it.**

**Track A — Offline core (Tasks 1–9, Part 6).** Independently deployable at every checkpoint.

| Day | Date | Track A |
|---|---|---|
| 1–2 | 22–23 May | Task 1 scaffold; Task 2 offline mechanism — **prove the real-path airplane test early** |
| 3 | 24 May | Task 3 basemap + geo + map |
| 4 | 25 May | Task 4 GPS + Map; Task 5 baked route pack |
| 5 | 26 May | Task 6 safety/ready; Task 7 plan + meet; Task 7b bus marker |
| 6 | 27 May | Task 8 shell/UX; device test matrix — **Track A is now shippable on its own** |

**Track B — Networked layers (Bus Pulse + group relay).** Starts day 1 in parallel; the backend needs no UI. Client overlays merge into Track A only after the core map exists (~day 5+).

| Day | Date | Track B |
|---|---|---|
| 1–2 | 22–23 May | **B1:** Cloudflare Worker + Durable Object for the per-group relay room (wss). **B2:** Bus Pulse Worker + DO (ingest + edge-cached aggregate read) |
| 3–4 | 24–25 May | **B3:** `lib/relay.ts` (wss client: reconnect, throttle ≤1/30 s, abort) + `lib/group-room.ts` (room code, membership, encrypted positions — reuse `match-room/src/shared/{crypto,peer-id,relay-gossip}.ts`) |
| 5 | 26 May | **B4:** `screens/GroupScreen.tsx` — room create/join, live map overlay with per-dot ages; the bus as a room member |
| 6 | 27 May | **B5:** Bus Pulse confidence-wave overlay on the Map screen; anti-spam tuning; disclosure copy + `privateRelay` capability |

**Integration & launch**

| Day | Date | Both tracks |
|---|---|---|
| 7 | 28 May | Merge Track B overlays into Track A; full device matrix incl. networked layers; deploy; **launch** in r/Gunners + WhatsApp |
| 8–9 | 29–30 May | Hardening; route-pack updates as official info firms; **final route-pack push night of 30 May** |

This is aggressive. Safeguards: (1) Track A is independently deployable from day 6 — if Track B slips, a bulletproof offline app still ships; (2) Track B reuses match-room's existing relay/crypto code rather than building from scratch; (3) the "one anchor with signal" form of Rung 2 is just the Task B3 relay client — no extra work. Pure browser-only LAN mesh is on neither track; it is a post-parade research spike.

---

## Part 12 — Definition of Done

**v1 core** — open once online, then disable the network:
- [ ] App cold-starts offline on the **real `/run/parade-companion/` path** inside the platform shell (tab closed + reopened).
- [ ] DevTools Network panel shows **zero successful requests** on Map/Meet offline.
- [ ] Basemap renders; GPS dot + accuracy radius appears.
- [ ] Group plan visible offline; QR + link round-trip a plan between two devices.
- [ ] Safety & Transport fully populated offline; "bus passed me" marker records offline.
- [ ] A malformed `route-pack.json` does not blank the app (falls back to the minimal default).
- [ ] No console errors offline; deploy-scanner passes; repo health gate green; Lighthouse PWA + offline audits pass.

**Device matrix** — each runs: fresh online load → "Ready"; airplane + Location → cold reopen; kill → reopen offline; QR round-trip; GPS fix; ~1 h GPS battery check.

| Device | Mode |
|---|---|
| Older iPhone | Safari tab |
| Modern iPhone | Add to Home Screen (standalone) |
| Android | Chrome, installed PWA |
| Low-end Android | storage + perf |

**Networked layers (required):** every position/sighting shows age + source; Map/Meet/Group render identically with the relay down; relay is opt-in and disclosed (`privateRelay` capability); per-room Durable Object isolation verified; Bus Pulse anti-spam (edge rate-limit + 3+ clustering + 8-min decay) verified; no networked code is imported by the core screens.

---

## Part 13 — Launch

Post in r/Gunners + Arsenal WhatsApp groups **Thu 28 May**:

> Phones won't work at the parade — millions of people, no signal. Built a free app that works completely offline:
> • Parade route map with a GPS "you are here" dot (no internet needed)
> • Make a meet-up plan with your group and share it by QR/link
> • Road closures, station info, first aid, exits — all saved to your phone
> Set it up before you go, on Wi-Fi — it works on parade day with zero signal. No account, no download — open the link and tap "Add to Home Screen".
> [shippie URL] — unofficial, fan-made.

Then push route-pack updates as Islington Council / TfL / the Met firm up details, final update the night before.

---

## Part 14 — Self-review (run before Task 9 deploy)

1. **Spec coverage:** every Part-2 screen and Part-1 fix maps to a task. The networked layers (Parts 9c, 10 rung 1) are explicitly staged, not silently dropped.
2. **Placeholder scan:** no "TBD"/"handle errors"/"similar to" in v1 tasks.
3. **Type consistency:** `MapExtent`, `RoutePack`, `GroupPlan`, `lngLatToPixel`, `bearingDeg`, `validateRoutePack`, `loadRoutePack`, `recordSighting` each defined once, referenced consistently.
4. **Promise check:** does any v1-core code path touch the network? If yes, it is a bug — fix before deploy.
