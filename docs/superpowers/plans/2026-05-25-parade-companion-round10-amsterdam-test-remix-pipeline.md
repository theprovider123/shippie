# Round 10 — Amsterdam test pack · Map review · Remix-to-anywhere pipeline

> **Branch state:** uncommitted round-9 polish on `review-implementation-2026-05-23` · 95/95 tests · CSS 8.92 KB gz · JS 125.46 KB gz · platform SW precaches via `shippie.json#runtime_assets`.
>
> This plan answers three things in one read:
> 1. **What's actually flowing through the app** (the pipes — for the architecture review)
> 2. **What's wrong / right with the map** (the visual + interaction critique)
> 3. **How to test it tonight in Amsterdam** (Phase A) and **how to make it remix-able** (Phase B, post-parade)

---

## 1. The pipes — every wire in one diagram

### Static foundation (compiled into the bundle)

```
src/data/parade-2026.ts
  ├── CORRIDOR_EXTENT       (Islington bounds + 1800×1800 canvas)
  ├── FALLBACK_ROUTE_PACK   (the in-code copy of the day-one pack)
  └── types: RoutePack, RoutePoi, RouteBanter*

public/route-pack.json
  └── the baked pack (loaded via `import bakedRoutePack from '...'`)
                       ↓
              src/lib/route-pack.ts
              ├── loadRoutePack()    → baked + later cache, validated
              ├── syncRoutePack(url) → POSTs /__shippie/parade/route-pack
              │                         → validates, writes to localStorage
              └── validateRoutePack() → guards against off-corridor coords
```

### The spatial primitives (`lib/geo.ts`)

```
lngLatToPixel(point, extent?)   ← every map dot uses this
pixelToLngLat(pixel, extent?)   ← (unused today, useful for tap-to-coord)
isInsideExtent(point, extent?)  ← validator gate
metersToPixelRadius(...)        ← GPS accuracy ring + walking-line scale
haversineMeters(a, b)           ← extent-agnostic
nearestRouteSegment(p, coords)  ← extent-agnostic
bearingDeg(a, b)                ← extent-agnostic
```

**Critical observation:** every spatial primitive that needs the extent **already takes it as an optional parameter, defaulting to `CORRIDOR_EXTENT`**. This was forward-thinking; the remix path is half-built.

### Per-device state (`lib/shippie-db.ts`)

```
loadGroupPlan() / saveGroupPlan(plan)    → IndexedDB via container bridge, localStorage fallback
listFanEvents() / saveFanEvents(evs)     → same, with TTL pruning + dedupe
listBusMarkers() / saveBusMarker(...)    → same
```

All three are container-bridge-backed when running inside Shippie's iframe, fall back to localStorage when standalone (dev). **No coupling to corridor extent — these work anywhere.**

### Relay (`lib/live-sync.ts`)

```
publishFanPulse(events, route)  POST /__shippie/parade/fan-pulse
pullFanPulse(route)             GET  /__shippie/parade/fan-pulse?segments=…
```

- Quantizes lat/lng to **4 decimal places** before publish (~11 m of jitter, anonymity floor)
- Drops `need_help` from publish (`PUBLISHABLE_TYPES` list)
- Segment IDs are `seg-0..seg-N` derived from `route.coordinates` — **so they auto-rescope if the route changes**
- Cadence governed by `lib/sync-cadence.ts` (round 9): 20s / 60s / paused / 30→60→120 backoff
- Round 9 made `runCrowdSync('tap', event)` fire on every local tap when online — immediate push, not a 20-second wait

### Crowd-sync over QR (`lib/fan-events.ts`)

```
encodeFanEventsForSync(events) → base64url fragment via shippie-kit shareCodec
decodeFanEventsSync(fragment)  → opposite; tolerates up to 3600 chars (~36 events)
```

Phone-to-phone resilience: no server needed. **Extent-coupled** because `validateFanEvent` checks `isInsideExtent`.

### Group plan share (`lib/group-plan.ts`)

```
encodePlan(plan)      → fragment with optional room {roomId, roomKey}
decodePlan(fragment)  → opposite; roleHint = 'join' | 'watch'
ensurePlanRoom(plan)  → mints a room if missing (used by share/share-my-dot)
```

### The render tree

```
App.tsx (the orchestrator — 800 lines)
├── topbar (offline pill · ⋯ menu: Battery saver, Sync QR, Edit name, Help, About)
├── wordmark band
├── day-banner OR day-banner--warn (eve / day / pack-stale)
├── ReadinessChip (visible={false} — checks cache, fires callback only)
├── ImportPreviewSheet (modal)
├── ToastHost
├── Onboarding (modal, first-run)
├── name-sheet (modal)
├── side-ting-sheet (modal)
├── AboutSheet (modal)
└── screen-host (scroll container)
    ├── MapScreen      ← current default
    ├── GroupScreen
    ├── BanterScreen
    └── SafetyScreen
└── bottom-nav (4 tabs, re-tap = scroll-to-top)
```

### Heart of the map

```
MapScreen.tsx
├── StatusStrip (GPS · Route · Sync, all one row)
├── div.map-stage
│   ├── CorridorMap
│   │   ├── corridor-map__world (transformed for pan/zoom)
│   │   │   ├── basemap webp
│   │   │   ├── canvas (POIs + route + GPS + bus + side-tings + walk line + schedule markers)
│   │   │   └── poi-hit-layer (invisible buttons over POIs)
│   │   └── corridor-map__controls (+ / − / ⊙)
│   └── ParadersChip      ← round 9 paraders counter
├── map-status (one-line summary)
├── PoiSheet (modal when POI tapped)
├── GoalPointer (compass-corrected arrow when walkTarget set)
├── gps-hint (after 5s no fix)
├── timing-chip OR timing-panel
├── tap-panel (Quick tap + More reports)
└── map-tools-toggle (collapsed: quick-find, layers, crowd compass)
```

### What's intentionally **decoupled** (already remix-ready)

| Module | Coupling to "this is Islington" |
|---|---|
| `gps.ts`, `compass.ts`, `haptic.ts`, `toast.ts` | None — pure browser APIs |
| `display-name.ts`, `side-tings.ts`, `group-plan.ts` | None — generic strings |
| `sync-cadence.ts`, `offline-celebration.ts`, `onboarding.ts`, `parade-time.ts` | None — pure logic |
| `paraders.ts`, `banter.ts`, `chat-presets.ts` | None |
| `shippie-db.ts` | None |
| `geo.ts` | **Optional** — already takes extent param |
| `live-sync.ts` | None (uses route segments, not extent) |
| `fan-events.ts` | Light — `validateFanEvent` uses `isInsideExtent` |

### What's tightly coupled (the remix work)

| Module / file | What ties it to Islington |
|---|---|
| `data/parade-2026.ts` | `CORRIDOR_EXTENT` constant; `FALLBACK_ROUTE_PACK` |
| `public/route-pack.json` | The baked pack |
| `public/basemap/corridor.webp` | The basemap image |
| `lib/parade-grid.ts` | Imports `CORRIDOR_EXTENT` for the grid math |
| `lib/route-pack.ts` | Validates pack POIs/landmarks against the static extent |
| `lib/group-plan.ts` | One import of `CORRIDOR_EXTENT` for default plan points |
| `lib/fan-events.ts` | `ROUTE_SEGMENT_LABELS` hardcoded (5 strings) + `PUBLIC_PULSE_CUTOFF_ISO` |
| `lib/banter.ts` + pack `banter.*` | Arsenal chants, polls, trivia |
| Multiple components | Copy: "supporters", "fans", "Arsenal", "Islington" |
| `styles.css` | Arsenal red `#EF0107` as `--red` |

**Counted hardcoded references:** `parade` (225), `Arsenal` (16), `Islington` (13), `Highbury` (11), `Drayton` (8), `Upper Street` (5).

---

## 2. Map review — what's right, what's still wonky

### Right (don't change)

- **One canvas + one webp, no tile server.** This is the whole reason it works offline at parade scale. Don't replace with PMTiles for v1 even when v1.1 tempts you.
- **POI hit-zones are HTML buttons inside the world transform.** They scale with zoom for free and don't need ray-casting math against the canvas — clever and keyboard-accessible.
- **The canvas + DPR-independent label scale.** Labels are drawn at 52 px regardless of CSS scale; they get crisp when pinched in, fade naturally when zoomed out via §M7 below.
- **`drawLabel` edge-clamping** prevents labels going off-canvas — well-implemented.
- **Schedule markers ①②③** float above the route polyline — instantly readable timing context.
- **GoalPointer dashed sage line** is a visually distinct verb for "this is your goal, not your route."
- **Bus marker age fade** (full → 0.32 alpha over 60 min) — calmly retires old data.

### Wonky (worth fixing before launch, cheap)

- **M1 — The basemap is a hand-drawn schematic without street names.** At 62 KB compressed it's gentle on offline, but visually it reads as "abstract art with a route". A user trying to orient ("which way is Upper Street?") has nothing to anchor against. *Fix:* annotate the WebP with street names baked in (export from Figma at 2x DPR ~150 KB once). Already planned for v1.1.
- **M2 — Bus tap label says "Bus tap" / "Old bus tap"** — confusing semantic (was it the bus, or was it someone *tapping* a bus?). *Fix:* say `Bus here` and `Bus here · 30m old`.
- **M3 — Walk line dashed pattern is `[2, 18]`** — looks like Morse code more than a path. *Fix:* try `[8, 12]` for a clearer dotted-line feel. Tiny.
- **M4 — POI labels at zoom 1.0 still collide** in dense areas (Highbury Corner has 4 POIs within 80 m). Round-9 hid water/atm/toilet labels at <1.5x but landmarks still overlap. *Fix:* implement the cheap AABB collision check I noted in round 8 — lay landmarks first, drop overlapping ones, defer to zoom.
- **M5 — `corridor-map__controls` (+/−/⊙) overlap the paraders chip top-left** when paraders count is high (more characters on the chip). Currently OK because controls are top-right but worth verifying at extreme widths.
- **M6 — No "you have a stale fix" affordance** on the GPS dot. If your fix is 60 s old, the dot is still drawn at full opacity. Compare bus markers which fade. *Fix:* dim the GPS dot alpha when `formatGpsAge > 30 s`.
- **M7 — Pinch zoom on the basemap doesn't recompute the canvas labels.** They scale linearly with the world transform. Already-drawn 52 px labels at scale 3.2× look chunky. *Fix:* at high zoom, redraw at smaller font size (the `scale` ref is already in deps).

### Edge cases that DO work (verified in this pass)

- **GPS dot outside extent** — `lngLatToPixel` happily computes a pixel outside 0..1800. The canvas clips it. Drawing goes through without error. This is what enables Amsterdam testing.
- **Empty `pack.pois`** — `points` becomes just plan markers + target. Renders fine.
- **`route-tbd` status with no coords** — `nearestRouteSegment` returns null, `routeDistance` is null, `routeLabel` shows `—`. No crash.
- **Pan beyond extent edge** — `clampOffset` constrains within `frame.getBoundingClientRect()`. Works.

### Edge cases that **don't** work (for Amsterdam testing — heads-up)

- **`validateRoutePack` will reject** a pack whose route coordinates are outside `CORRIDOR_EXTENT`. The Amsterdam pack must come with a matching extent OR we relax the validator.
- **`createFanEvent` calls `validateFanEvent`** which calls `isInsideExtent` on the fan's GPS — Amsterdam taps would fail validation and silently not save. Same fix needed.

---

## 3. Amsterdam test — Phase A (do tonight)

**Goal:** a real walk in Amsterdam, taps that save, GPS dot that moves on the map. No relay, no polish. ~30 minutes of work.

### Surgical edits (3 files, ~20 lines net)

**Step 1 — Pick your walking area.** I'll use **Vondelpark loop** as a default since it's well-defined and ~3 km. Tell me a different bounding area if you want.

For Vondelpark loop:

```ts
// data/parade-2026.ts
export const CORRIDOR_EXTENT: MapExtent = {
  west:  4.860,
  east:  4.890,
  south: 52.353,
  north: 52.366,
  pxWidth: 1800,
  pxHeight: 1800,
};
```

**Step 2 — Swap the route pack.** Edit `public/route-pack.json`:

```jsonc
{
  "schemaVersion": 1,
  "packVersion": "2026-05-25T20:00:00+02:00",
  "event": {
    "title": "Test Walk — Amsterdam",
    "dateLabel": "Sunday 25 May 2026",
    "startTime": "2026-05-25T20:00:00+02:00",
    "status": "route-tbd"
  },
  "sources": [{ "label": "local test", "url": "https://example.test", "note": "ad-hoc" }],
  "route": {
    "type": "LineString",
    "label": "Vondelpark loop",
    "coordinates": [
      [4.8730, 52.3590],   // east entrance
      [4.8680, 52.3580],   // halfway
      [4.8640, 52.3565],   // west tip
      [4.8680, 52.3555],   // south path
      [4.8730, 52.3590]    // back to start
    ]
  },
  "pois": [
    { "id": "v-east",  "kind": "landmark",  "name": "Park east gate",     "lng": 4.8731, "lat": 52.3590 },
    { "id": "v-cafe",  "kind": "food",      "name": "Vondeltuin café",    "lng": 4.8645, "lat": 52.3568 },
    { "id": "v-wc",    "kind": "toilet",    "name": "Park WC",            "lng": 4.8682, "lat": 52.3578 }
  ],
  "meetingLandmarks": [
    { "id": "v-east", "label": "East gate", "lng": 4.8731, "lat": 52.3590 }
  ],
  "scheduleEstimate": [
    { "label": "Start walk", "time": "20:00", "note": "test", "lng": 4.8730, "lat": 52.3590 }
  ],
  "closures": [],
  "transport": { "stations": [], "stepFreeRoutesOut": [] },
  "safety": [{ "heading": "Test", "body": "This is a local dev pack." }]
}
```

**Step 3 — Replace or null the basemap.** Two options:
- **Option A (5 sec):** Delete `public/basemap/corridor.webp`. The CorridorMap's `<img src>` will 404 (the canvas still renders fine). Map looks bare cream — that's fine for testing.
- **Option B (5 min):** Drop in any Amsterdam square map (Wikipedia, OSM screenshot). 1800×1800 px, save as webp. Will look misaligned to the canvas overlay, but visually orients you.

**Step 4 — Run.**

```bash
cd apps/showcase-parade-companion
bun dev
# in another terminal, ngrok / cloudflared the dev server if you want to test
# from your phone (geolocation works over https or localhost only)
```

For phone testing without HTTPS hassle:
- iOS Safari → `localhost:5252` over USB tunnelling
- Android Chrome → `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → add `http://<your-laptop-ip>:5252`

### Watford pack — for friends to test in parallel

Same shape, different geography. Watford is friendly to this because Vicarage Road stadium → town centre is a natural ~2 km walk that mirrors the Islington corridor.

```ts
// data/parade-2026.ts — bounds covering Vicarage Road → Town Centre → Cassiobury Park
export const CORRIDOR_EXTENT: MapExtent = {
  west:  -0.420,
  east:  -0.385,
  south:  51.645,
  north:  51.668,
  pxWidth: 1800,
  pxHeight: 1800,
};
```

```jsonc
// public/route-pack.json
{
  "schemaVersion": 1,
  "packVersion": "2026-05-25T20:00:00+01:00",
  "event": {
    "title": "Test Walk — Watford",
    "dateLabel": "Sunday 25 May 2026",
    "startTime": "2026-05-25T20:00:00+01:00",
    "status": "route-tbd"
  },
  "sources": [{ "label": "local test", "url": "https://example.test", "note": "ad-hoc" }],
  "route": {
    "type": "LineString",
    "label": "Vicarage Road → Town Centre",
    "coordinates": [
      [-0.4019, 51.6498],   // Vicarage Road stadium
      [-0.4015, 51.6520],   // Wiggenhall Road
      [-0.3995, 51.6555],   // Lower High Street
      [-0.3960, 51.6580],   // High Street
      [-0.3935, 51.6605]    // Watford Junction area
    ]
  },
  "pois": [
    { "id": "vicarage-rd",  "kind": "landmark", "name": "Vicarage Road stadium", "lng": -0.4019, "lat": 51.6498 },
    { "id": "high-street",  "kind": "landmark", "name": "Watford High Street",   "lng": -0.3970, "lat": 51.6580 },
    { "id": "junction",     "kind": "station",  "name": "Watford Junction",      "lng": -0.3935, "lat": 51.6605 },
    { "id": "high-st-tube", "kind": "station",  "name": "Watford High St",       "lng": -0.3960, "lat": 51.6555 },
    { "id": "cassiobury",   "kind": "exit",     "name": "Cassiobury Park",       "lng": -0.4180, "lat": 51.6610, "note": "Large green space west of the route." },
    { "id": "intu-centre",  "kind": "food",     "name": "Atria / shopping",      "lng": -0.3965, "lat": 51.6575 },
    { "id": "town-wc",      "kind": "toilet",   "name": "High Street WC",        "lng": -0.3962, "lat": 51.6582 }
  ],
  "meetingLandmarks": [
    { "id": "vicarage-rd", "label": "Stadium area", "lng": -0.4019, "lat": 51.6498 },
    { "id": "junction",    "label": "Watford Junction", "lng": -0.3935, "lat": 51.6605 }
  ],
  "scheduleEstimate": [
    { "label": "Start at stadium", "time": "20:00", "note": "test", "lng": -0.4019, "lat": 51.6498 },
    { "label": "Town Centre",      "time": "20:20", "note": "halfway",  "lng": -0.3970, "lat": 51.6580 },
    { "label": "Watford Junction", "time": "20:35", "note": "end",      "lng": -0.3935, "lat": 51.6605 }
  ],
  "closures": [],
  "transport": {
    "stations": [
      { "name": "Watford Junction", "status": "open-check", "note": "London Overground + National Rail." },
      { "name": "Watford High Street", "status": "open-check", "note": "Overground only; smaller." }
    ],
    "stepFreeRoutesOut": [
      { "label": "South via High St", "via": "Down Lower High Street toward Bushey", "note": "Quieter exit." }
    ]
  },
  "safety": [{ "heading": "Test", "body": "This is a local dev pack for Watford friends." }]
}
```

### Two test packs at once — what it costs

To let **you walk Amsterdam** and **friends walk Watford** on the same deployed instance, you need **Phase B Move 1** (extract `mapExtent` into the pack). The work:

- Drop `CORRIDOR_EXTENT` as a hard constant; make it a property of `RoutePack`
- Pack each pack with its own `mapExtent`
- Thread the loaded extent through `lngLatToPixel` / `validateRoutePack` / `parade-grid.ts` callers
- Add a `?pack=amsterdam` / `?pack=watford` / `?pack=arsenal` URL toggle to `loadRoutePack()`

**Estimated time: ~45 min.** Lower risk than it sounds — `geo.ts` already accepts the extent as an arg on every function, so it's mostly threading and removing the `import { CORRIDOR_EXTENT } from '../data/parade-2026'` lines.

**Without Phase B Move 1:** the friends-Watford test would need a separate deployed instance (separate branch / separate Cloudflare deploy slot). Same code, two checkouts. Workable but messier.

### Stash the diff so it doesn't pollute parade prep

```bash
git stash push -m "amsterdam-test-pack" \
  apps/showcase-parade-companion/src/data/parade-2026.ts \
  apps/showcase-parade-companion/public/route-pack.json \
  apps/showcase-parade-companion/public/basemap/corridor.webp

# When done: git stash pop
```

Or land on a throwaway branch:

```bash
git checkout -b test/amsterdam-walk
# make the edits, commit, push, walk
# when done: git checkout review-implementation-2026-05-23
```

### What you'll be able to do tonight

- ✅ See your GPS dot on the map (no basemap is fine)
- ✅ Tap "I am here", "Bus is here", "Toilet here"
- ✅ See the schedule marker ① at your start point
- ✅ Watch the paraders chip if you tap multiple times (need ≥3 different `source_id`s though — open 3 tabs on your laptop with different localStorage to fake)
- ✅ Open a group, save a plan
- ✅ Share a QR (won't be scannable across phones offline without a relay endpoint live, but the encode/decode round-trips work via paste in the side-ting sheet)
- ❌ Live relay sync (you'd hit the platform's relay endpoint — fine if deployed, no-op if local-only)

### Edge cases to verify on your walk

| Try this | Expect |
|---|---|
| Tap "I am here" with GPS accuracy > 50 m | Warn toast, no save |
| Walk 100 m, tap again | New marker, old one stays (TTL of `~3 hours` per `expires_at`) |
| Put phone in pocket, walk 5 min, take out | GPS keeps watching; battery-saver throttles |
| Open Map tab → tap Map again in nav | Scroll to top |
| Pinch to 3x zoom, then ⊙ button | Resets to default |
| Toggle battery-saver in ⋯ menu | GPS subscription rebuilds (faster cadence off-saver) |

---

## 4. Remix pipeline — Phase B (post-parade, the proper one)

The Amsterdam test proves the concept. To turn that into a real "use it for any walk / parade / event" feature, here's the pattern.

### What needs to move from constants to runtime config

**Pack-driven (already mostly there):**
- `CORRIDOR_EXTENT` → ship as `pack.mapExtent`
- `ROUTE_SEGMENT_LABELS` → `pack.route.segmentLabels?` (optional, fallback to "Segment N")
- `pack.banter` → already pack-driven
- `pack.scheduleEstimate` → already pack-driven
- `pack.safety` → already pack-driven

**Theme-driven (new):**
- Arsenal red `--red` → `pack.theme.primary` (CSS custom property override)
- "supporters" / "fans" / "paraders" copy → `pack.theme.audienceNoun` (default `"paraders"`)
- App title / wordmark → `pack.theme.title` + `pack.theme.wordmark`

### The remix data flow

```
pack-registry/
├── arsenal-islington-2026.json        ← the current parade pack
├── amsterdam-vondelpark-test.json     ← Phase A test
├── liverpool-2026.json                ← future LFC trophy parade
├── nyc-pride.json                     ← future, big parades pattern
└── ams-kings-day-2026.json            ← future, festival pattern

URL: /run/parade-companion/?pack=arsenal-islington-2026
        ↓
App.tsx → loadRoutePack(packId) → fetches from /__shippie/packs/{packId}.json
                                ↓
                          validateRoutePack(extent ← pack.mapExtent)
                                ↓
                          theme.applyTheme(pack.theme)
                                ↓
                          render
```

### The four moves needed

**Move 1 — `pack.mapExtent` lives in the pack.** Drop the global constant from `data/parade-2026.ts`. Every function that takes `extent?` keeps doing so; the default comes from the loaded pack, not a module-scoped const. *Cost: ~30 lines of plumbing.*

**Move 2 — Pack registry server-side.** A new `/__shippie/packs/index.json` lists available packs. The app shows a tiny "Switch pack" item in the About sheet (or a `?pack=` query string for direct linking). *Cost: small.*

**Move 3 — Theme tokens.** Three new CSS custom properties: `--theme-primary`, `--theme-accent`, `--theme-display-font`. The pack ships overrides, App.tsx injects via a `<style>` element at root mount. *Cost: tiny.*

**Move 4 — Copy tokens.** Replace literal "supporters" / "fans" / "Arsenal" with template strings sourced from `pack.theme.copy`. Long but mechanical. *Cost: ~100 lines of search/replace.*

### What you'd be able to do v1.1

- **Liverpool parade 2026** — same app, swap pack
- **Pride parade NYC** — different colours (rainbow palette via theme), different chants, same map mechanics
- **Marathon spectator** — `event.startTime` becomes the gun, `scheduleEstimate` becomes mile markers
- **Amsterdam Kings Day** — temporary "is this party crowded?" map that goes dark at end of day via `event.endTime`
- **Local walking tour** — schedule estimate becomes tour stops, POIs become attractions

### The thing to NOT do

**Don't make it a CMS.** No "build your own pack in a UI" feature for v1.1. The packs are JSON files in a git repo, PR'd by people who know what they're doing (you + codex). Templates encourage forking; UIs encourage drift.

### Naming the broader product

The current name `parade-companion` is Arsenal-specific. The remix-able pattern wants a more generic name internally — something like:

- **Companion** (drop the "parade")
- **Crowd** (single word, evokes the use case)
- **HereWith** (the "you're here with N other phones" essence)

Doesn't matter today. Just flagging that the URL `/run/parade-companion/` would become awkward when half the active packs are non-parades.

---

## 5. Recommended sequence

### Tonight (Phase A — Amsterdam test)
1. **Pick a bounding area** in Amsterdam (Vondelpark loop is my default; tell me different)
2. **3-file edit:** `CORRIDOR_EXTENT` + `route-pack.json` + delete basemap webp
3. **`bun dev`** and walk
4. **Stash or branch** when done

### Tomorrow (parade day prep)
5. Pop the stash / drop the branch → back to Islington
6. **DevTools 5-step offline audit** (from round 9 §5)
7. **Real-phone walk** with iPhone Safari "Add to Home Screen"
8. **Commit the round-9 polish + paraders chip** before parade morning

### Post-parade (Phase B — remix v1.1)
9. Move `CORRIDOR_EXTENT` into the pack itself (Move 1)
10. Move route segment labels into the pack (Move 1.5)
11. Pack registry endpoint (Move 2)
12. Theme tokens for colour + audience noun (Move 3)
13. Copy-token sweep (Move 4)
14. Ship a Liverpool pack as the first remix proof

---

## 6. Risks for Phase A (heads-up)

- **GPS over HTTP** — Safari and Chrome both require HTTPS or localhost. Phone testing over LAN needs the Chrome flag workaround OR an ngrok/cloudflared tunnel.
- **The relay endpoint** `/__shippie/parade/fan-pulse` returns 404 in local dev (no platform behind it). The app silently treats this as sync failure → backoff → quiet. No crash, just "sync OFF" in the StatusStrip. That's fine for solo walk testing.
- **Onboarding will re-prompt** if you clear localStorage. Just dismiss.
- **The cached `live-route-pack` in localStorage** (from previous parade testing) can mask your Amsterdam edits. `localStorage.removeItem('parade-companion:live-route-pack:v1')` clears it, or just use a fresh profile / private tab.
- **`isPackStale` will fire** with the gold "Pack stale — open on Wi-Fi" banner because the pack version is "from today". Wait — that's fine actually; the timestamp is current. **Won't fire.**

---

## 7. The 30-minute path I'd take

If you want me to do Phase A right now:

1. I'll edit `CORRIDOR_EXTENT` + `route-pack.json` in place
2. Delete `public/basemap/corridor.webp` (canvas still renders, paper background)
3. Type-check + test (the validator will accept the new bounds since it reads from the pack itself for validation)
4. Print you a `bun dev` command + the URL
5. **Hand you a `git stash` command** to put it all away when you're done walking

Or if you'd prefer the Phase B foundation laid first — pack-driven extent so packs are interchangeable without code edits — that's ~1 hour. Up to you.

---

## 8. Map review — one-screen summary

| | Verdict |
|---|---|
| Offline-first single-canvas pattern | ✅ keep |
| POI hit-zones as HTML buttons | ✅ clever, keep |
| Annotated basemap | 🟠 v1.1 — biggest visual win pending |
| Bus tap copy | 🟠 polish — "Bus tap" reads ambiguous |
| Walk-line dash pattern | 🟠 polish — `[2,18]` looks like Morse |
| Label collision at zoom 1 | 🟠 cheap AABB win pending from round 8 |
| GPS staleness affordance | 🟠 dim the dot at >30s old |
| Pinch-zoom label scale | 🟠 dim/shrink labels at high zoom |
| Pan/zoom + recenter | ✅ solid |
| Schedule markers ①②③ | ✅ great |
| Paraders chip | ✅ shipped round 9 |
| Map dominance in layout | ✅ shipped round 9 |
| GoalPointer walk-line | ✅ keep |
| Bus marker age fade | ✅ keep |

---

## 9. Decisions for you

1. **Amsterdam swap right now?** Recommend yes — 30 min, stashable.
2. **Vondelpark loop, or a different Amsterdam area?** Default Vondelpark.
3. **Delete the basemap or replace with an Amsterdam image?** Delete; faster and cleaner.
4. **Watford pack — same dev instance or a separate branch?**
   - **Same dev instance (recommended)** — do Phase B Move 1 now (~45 min extra). Then both you AND friends can hit one deploy with `?pack=amsterdam` / `?pack=watford` / `?pack=arsenal`. Sets up the long-term remix pattern. **+45 min.**
   - **Separate branch** — two checkouts, two deploys. Friends use `test/watford-walk`; you use `test/amsterdam-walk`. Fastest path but messier and doesn't help post-parade. **+5 min.**
5. **Post-parade, ship the full remix pattern (Phase B Moves 2-4)?** Yes if there's appetite for Liverpool / Pride / Marathon packs. Otherwise hold.

### My recommended path

**Do Phase B Move 1 now (multi-pack support), then ship both packs.** It's the only path that doesn't waste your time:
- Friends in Watford get a real deploy they can install once and walk with
- You can swap your own session to Amsterdam mid-walk if you want
- The Arsenal pack stays untouched as the "real" one
- The parade-day deploy can be `?pack=arsenal` (the default), so the Islington fans don't even notice
- Post-parade, Liverpool / Pride / your-next-event packs just drop in as JSON

**Hands-off path (if you're tight on time):** I'll do Amsterdam-only as a 3-file edit + stash command, you handle Watford by sending the JSON to whoever's testing.
