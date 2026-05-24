# Round 8 — Map detail · First-use polish · Honest feedback · Offline audit

> Branch state at write: **43/43 tests · build OK · 0 fail typecheck · `83073bb4 fix(showcase): harden parade offline launch`** is the latest parade commit on `codex/parade-companion`.
> Codex shipped almost all of round 7. This round closes the seams left behind, audits offline plumbing, and rebuilds the map around fine-grained POI detail — the user's headline ask: *"the route is small but the detail will be large."*

---

## 1. Round 7 implementation status

| Item | Status | Notes |
|---|---|---|
| `lib/display-name.ts` + test | ✅ shipped | clean, capped at 24 chars, default `Me` |
| `lib/onboarding.ts` + `Onboarding.tsx` | ✅ shipped | 2-slide flow, skip enabled |
| Topbar overflow menu + Edit-name sheet | ✅ shipped | menu is plain `…` text |
| `BanterScreen` with Chants / Polls / Cheer | ✅ shipped | one screen, three cards |
| `lib/banter.ts` + test | ✅ shipped | local-only, cheer caps at 999 |
| 4-tab nav (Map · Group · Banter · Safety) | ✅ shipped | |
| `ShareMyDotEmptyState` cleanup | ✅ deleted | replaced by `GroupIdentityCard` solo |
| Side-tings empty copy tightened | ✅ shipped | *"Add a friend's QR to watch their crew here."* |
| Bus-timing collapse-to-chip | ❌ deferred | full panel still always-on |
| "Parade is tomorrow" pre-day banner | ❌ deferred | only same-day banner exists |
| Poll relay broadcast | ❌ deferred | known — but the local-only fallback is **broken UX** (see §2) |
| Cheer broadcast | ❌ deferred | local-only is fine for v1 |

Test footprint grew 32 → 43 (+11), CSS 28.5 → 34.6 KB, JS gz 102 → 106 KB. Good.

---

## 2. Bugs & dead ends discovered in this review

These are real issues, not aspirations. Fix list:

### B1 — Banter poll counts lie to the user (severity: high)

`src/lib/banter.ts:62-68`:

```ts
export function pollOptionCount(pollId: string, optionId: string): number {
  return selectedOptionId(pollId) === optionId ? 1 : 0;
}
export function totalPollVotes(pollId: string): number {
  return selectedOptionId(pollId) ? 1 : 0;
}
```

The `BanterScreen` renders `count / total * 100%` bars based on these. Result: as soon as a user votes, **the bar always shows 100% for their pick and 0% for the rest** — which reads as "everyone voted the same way as me." That's a lie.

**Fix path for v1 (no relay):** Hide the bar entirely; show a single `"your pick"` chip on the selected option. Add a small note: *"Local only. Counts arrive when group relay ships."*

**Fix path for v1.1 (with relay):** Aggregate via the same relay/QR plumbing as chat signals; show real counts.

### B2 — Side tings "+ Add" has no add UI

`SideTingsCard.onAdd` triggers a toast (`"Open a friend's parade QR link, then choose Watch on map."`) but doesn't open any add UI. There is no paste-a-code path. For users who get a code over SMS/WhatsApp and can't open a QR link directly, the only path is to manually paste the hash into the URL bar. That's brittle.

**Fix:** Open a small sheet with a code-paste input + the existing instructional copy. Validate, decode, then call into the same `addSideTing` path the QR-import already uses.

### B3 — Import preview "Watch" silently fails on no-room invites

`App.tsx:152-173`:

```ts
const onWatchImport = () => {
  const incoming = importPreview?.plan;
  if (!incoming?.room) return;       // ← silent
  ...
};
```

If someone shares a pre-`ensurePlanRoom` plan (no room key), tapping Watch is a no-op. No toast, no error, no nothing. **Fix:** add `else showToast('This invite has no live room — try Join to copy the plan instead.', 'warn');`.

### B4 — Topbar menu doesn't close on outside click

`App.tsx:242-285`: `menuOpen` is a plain state toggle. Tapping elsewhere doesn't close it. **Fix:** add a `document` click handler that closes on outside clicks; respect `Escape` key.

### B5 — Name-editor sheet has no backdrop dismiss

`App.tsx:314-338`: only Save / Cancel close it. **Fix:** clicking the overlay backdrop dismisses; `Escape` cancels.

### B6 — "About" menu is just a toast

`App.tsx:274-283`: tapping About fires a single toast. There's no version, no credits, no source links, no offline-pack timestamp, no link to "what is this?". **Fix:** open a small `AboutSheet` with: pack version, app version (from `package.json`), unofficial disclaimer, link to council source PDF, link to Safety tab.

### B7 — Bus timing card is always full-width, no "now" cue

`MapScreen.tsx:251-262`: stays as a full panel year-round, with no "now" marker on the timeline.

**Fix:**
- Highlight the current timeline row (`now ≥ row.time` and `now < next.time`) with a sage left border + bold.
- After parade departure (`now > startTime + 30 min`), collapse to a chip in StatusStrip: *"Bus passed Drayton ~14:25 · expand"*. Expandable on tap.

### B8 — "Parade is tomorrow" nudge missing

`App.tsx:296-298`: `isParadeDay` only matches the same calendar day. There's no D-1 banner reminding people to save the app on Wi-Fi the night before. **Fix:** add an `isParadeEve` helper + a softer one-line banner: *"Parade is tomorrow. Open this page on Wi-Fi today so it works without signal."*

---

## 3. First-use flow audit

The actual journey today, opened cold:

```
1. URL opens → topbar + wordmark + (day banner) + readiness chip render
2. Onboarding overlay opens immediately
   ↳ Slide 1: "Hey, what should we call you?" + input + Skip / Continue
   ↳ Slide 2: "Set it once. Use it in the crowd." + 3 bullets + Back / Get started
3. Onboarding closes → Map tab is active
4. Map: layer toggles, basemap, status strip, "Tap what you see", Around you, Bus timing
```

### F1 — Onboarding never says what the app is

Slide 1 jumps straight to asking for a name. A first-time visitor doesn't know what they've opened. **Fix:** add a third leading slide (or rewrite slide 1):

```
Title: Parade Companion
Body: Offline map and group meet-up plan for the Islington victory parade.
      No account. Works without signal once you save it.
Action: Continue  ·  Skip
```

Then slide 2 collects the name, slide 3 stays as the "Set it once" orientation. Three slides feel light when each carries one idea. (Alternative: keep it two slides — slide 1 = name + tagline together; slide 2 = orientation.)

### F2 — No "save offline now" action in onboarding

Onboarding tells users "save offline" without offering to do it. The ReadinessChip is the only path to nudging the cache, and a first-time user hasn't navigated to it. **Fix:** the final slide gets a primary `Get started` AND a small `Open on Wi-Fi to save` info line that links the user's attention to the readiness chip after dismissal — or fires an automatic re-fetch of the assets to warm the cache.

### F3 — No celebration on first save

When the readiness chip flips from `checking` → `ready`, nothing happens. **Fix:** toast once: *"Saved to this phone. Try it offline now."* (gated by a localStorage flag so it only fires once).

### F4 — "Skip" onboarding loses the chance to ever set a name

If a user skips, the topbar `…` → Edit name is the only path. The Group identity card's solo state should show a small "Set your name" CTA if `displayName === 'Me'`. That's a clearer in-context prompt.

### F5 — Demo mode for non-Arsenal-fans? (defer)

Out of scope for parade day. Park for round 9+.

---

## 4. Feedback & notifications audit

What we have:
- **Toast bus** — single-slot, 2.5s auto-dismiss, variants (default / success / warn). ✅
- **Haptic alphabet** — `confirm` (30ms), `warn` (triple 60ms), `wow` (30-30-200ms). ✅
- **ReadinessChip** — passive offline state indicator. ✅
- **Day banner** — same-day. ✅

What's missing / weak:

### N1 — No tab badge for unread chat signals

When a group signal arrives (today: local-only; tomorrow: via relay), the Group tab doesn't badge. **Fix:** track an "unread since last tab visit" count in App state; render a small dot on the active nav button label.

### N2 — No "parade about to start" prompt

The day banner is always on during parade day, but there's no nudge at T-30min like "Parade starts in 30 minutes — check your plan." **Fix:** a one-shot countdown toast (or update the day banner copy) when `now` enters the `[startTime - 30min, startTime]` window. Gated by a flag so it only fires once per device.

### N3 — No haptic for chant taps

`BanterScreen.onChantToggle` only fires `hapticConfirm`. Cheers fire `hapticWow`. Poll votes fire `hapticConfirm`. That's reasonable. No change needed.

### N4 — Toast queue is single-slot — events can drop

If two events fire within 2.5s, the second replaces the first immediately. For chat signals arriving in a burst, this loses messages. **Fix:** small queue (max 3) with stacked display, or use the existing `chat-activity` feed as the "log" and reserve toasts for confirmations.

### N5 — No "no GPS yet" persistent hint

`saveEvent` toasts a warn when there's no fix, but a new user staring at an empty Around You panel doesn't know why. **Fix:** add a one-line empty-state above the tap panel when `gpsFix === null` for >5s: *"Turn on Location. The dot appears once your phone gets a fix."*

### N6 — Native browser notifications (deferred)

The PWA manifest already supports notifications, but no code paths use them. Parade day might benefit from a "Bus is passing your saved spot" push, but that needs a relay backend. **Defer.**

---

## 5. Offline plumbing — verify, don't compete

> **Correction to an earlier draft of this plan.** I claimed the showcase needed its own service worker because `vite.config.ts` has no `vite-plugin-pwa`. That was wrong. The Shippie platform SW already owns offline precaching for showcases via `shippie.json#runtime_assets`. Verified against HEAD; details below. **Do not add a competing showcase-side SW.**

### The actual machinery (confirmed against HEAD)

1. **`apps/showcase-parade-companion/shippie.json:23`** declares 9 `runtime_assets` (basemap + route-pack + 7 woff2).
2. **`apps/platform/src/lib/_generated/runtime-precache.ts:8`** (regenerated by `scripts/prepare-showcases.mjs`) lists each as a full path: `/__shippie-run/parade-companion/basemap/corridor.webp`, `…/route-pack.json`, `…/fonts/*.woff2`.
3. **`apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts:207`** calls `cacheAddAll(cache, RUNTIME_PRECACHE, ...)` inside the SW `install` handler — parade assets are precached at install time, not lazy on first request. A 404 or wrong content-type on any single asset is logged into `failed[]` but never blocks install.

### What still needs verifying (DevTools session, not code)

This is a one-shot manual check before parade. Codex already confirms the live asset manifest lists parade assets; this just walks the live runtime:

1. Open `/run/parade-companion/` in a real browser, fresh profile.
2. Application → Service Workers — confirm the platform SW is `activated and running`.
3. Application → Cache Storage — confirm `/__shippie-run/parade-companion/*` entries exist for basemap, route-pack, and the woff2s.
4. Toggle to Offline → hard-reload — confirm the showcase renders, map shows, fonts load.
5. **Cross-check ReadinessChip URLs against cache keys:** the chip uses `${import.meta.env.BASE_URL}*`. If `BASE_URL` resolves to `/run/parade-companion/` (the focused-shell path), `caches.match('/run/parade-companion/basemap/corridor.webp')` won't hit the cached `/__shippie-run/parade-companion/basemap/corridor.webp` entry. If the chip ever flips back to `needs-online` despite the SW being healthy, this URL mismatch is the likely culprit.

### Still standing from this section

- **O2 — Font weight audit:** 7 woff2 files cached. Grep `src/styles.css` for `font-weight: 500` and `font-weight: 700`; if unused, drop them from `shippie.json#runtime_assets` to shrink the precache by ~30-50 KB.
- **O3 — Basemap size:** codex confirms 62 KB — fine, not the gutted 1.6 KB I assumed. §6 still recommends a richer annotated version.
- **O4 — Route-pack stale check:** if `now - packVersion > 7 days`, the readiness chip's secondary line should change to *"Pack stale — re-open on Wi-Fi"*. Still a P2.

---

## 6. Map detail strategy — the centerpiece

> The user said it: *"the route is small but the detail will be large."*

### Current state

- One 1800×1800 webp basemap (corridor schematic, label-free).
- Canvas overlay: route polyline + 8 POIs + GPS + fan events + side tings.
- Zoom 1–3.2× via pinch + buttons; pan when zoomed.
- 5 layer toggles (`bus · friends · side-tings · reports · my-taps`).
- No street names visible at any zoom.
- No POI categorization on the map (all POIs are circles; only label distinguishes them).

### Goal

A schematic that still loads instantly, but where someone can find **a toilet, water, a pub, a tube exit, a quieter pocket** without leaving the app. Without bloating to PMTiles.

### Strategy — bake detail, don't render tiles

Three layers, all baked into the existing route pack:

#### Layer A — Annotated basemap

Replace `corridor.webp` with a higher-resolution annotated basemap that includes **major street names along the corridor** burned into the image. This is the cheapest way to get spatial readability — text doesn't reflow, it just zooms with the image, but at 3.2× max zoom the labels stay legible.

Tooling: export from Figma or a vector editor at 2× the current DPI; ~100-200 KB after webp encode. Still tiny vs. PMTiles.

#### Layer B — Practical POI library

Extend `RoutePoi.kind`:

```ts
type RoutePoiKind =
  | 'station'           // existing
  | 'landmark'          // existing
  | 'medical'           // existing
  | 'exit'              // existing
  | 'toilet'            // existing (currently unused in pack)
  | 'meeting'           // existing
  | 'stewards'          // existing
  | 'water'             // NEW
  | 'food'              // NEW
  | 'atm'               // NEW
  | 'pub'               // NEW
  | 'family'            // NEW (quieter pockets, family-friendly)
  | 'tube-exit'         // NEW (labeled by exit letter)
  | 'view'              // NEW (good vantage points along the route)
```

Bake **80–200 POIs** for the corridor bounding box, manually curated for parade day:
- 4–6 tube stations with exit-letter sub-POIs (e.g., `highbury-islington-exit-1`, `-2`, `-3`).
- 10–20 toilets (public + venue + portaloos if Council publishes).
- 15–30 pubs along the corridor.
- 8–12 cafes / quick food.
- 6–10 ATMs.
- 5–8 water fountains.
- 8–12 family/quieter pockets (the small streets off Upper Street, Highbury Fields' edges).
- Marked viewing pockets identified by the council (when published).

Source: OSM Overpass query for the corridor bounding box (`-0.125,-0.085,51.531,51.566`), filtered by `amenity` tags, manually QA'd. Format: existing `RoutePoi[]` in `route-pack.json`.

Size estimate: ~150 POIs × ~150 bytes each = ~22 KB JSON. After gzip ~5–8 KB. Trivial.

#### Layer C — Crowd movement guides

`pack.transport.stepFreeRoutesOut` already lists exit fallbacks. Extend with:

```ts
crowdFlows: Array<{
  id: string;
  label: string;          // "Northern exit pull"
  coordinates: [number, number][];
  direction: 'arrow';     // future-proof — could add 'caution' for choke points
  note?: string;
}>
```

Render as faint arrows on the basemap layer (toggleable, default off). 6–10 flows for the corridor. Sourced from council/Met Police crowd-management plans.

### Map UX additions

#### M1 — POI category filters

Extend `LayerToggleRow` from 5 to ~10 toggles. Group them: **People** (bus, friends, side-tings, reports, my-taps) and **Places** (toilets, water, food, pubs, atm). Two horizontal rows of chips.

#### M2 — POI tap → bottom sheet

Today, tapping the map does nothing (taps are buttoned via the "Tap what you see" panel). Add: tapping a rendered POI on the canvas opens a small bottom sheet with the POI's name, kind icon, distance from you, note, and a `Walk this way` action that draws a thin sage line from `gpsFix` to the POI.

Hit-testing: convert pointer x/y back to lng/lat (inverse of `lngLatToPixel`), find nearest POI within 30px of the tap, debounce against existing drag/pinch handlers.

#### M3 — "Find" search input

A small input above the LayerToggleRow: **Find a toilet · pub · water…** — tap, pick a category, the map highlights the nearest 3 with a small badge + draws the route line to the nearest one.

Implementation: simple filter against `pack.pois.kind`. No fuzzy search needed.

#### M4 — Distance-to-route chip

In StatusStrip, when GPS is live and not on-route, show: *"180 m to the route · 3 min walk"*. Reuses `nearestRouteSegment` which already exists in `lib/geo.ts`. Sustains the "where am I" question without opening the map.

#### M5 — Numbered timeline markers

`scheduleEstimate` has 3 entries (start / movement / disperse). Add `coordinates` to each schedule row so we can render `①` `②` `③` numbered markers along the route. Tappable → opens the timeline panel scrolled to that row.

#### M6 — "Walking compass" when off-route

When GPS shows the user is >100 m from any route point, show a small compass arrow in StatusStrip pointing toward the nearest route segment. Uses the existing `compass.ts` lib.

### Map sizing budget

| Asset | Today | Round 8 | Budget left |
|---|---|---|---|
| basemap webp | 1.6 KB | ~150 KB | well under 1 MB total |
| route-pack JSON (gz) | ~3 KB | ~10 KB | trivial |
| POI icons (CSS / unicode) | 0 | 0 | unicode glyphs only |
| Crowd flow lines | 0 | ~1 KB | trivial |

Total round-8 added weight: **~160 KB once, cached forever.** No JS heavyweights.

---

## 7. UI improvements miscellany

- **U1 — Map credit line** *"Offline schematic. Verify official route before travel."* is a fine disclaimer but currently rendered as plain text under the map; move into the map's bottom-right as a small subtle chip so it doesn't take a full row.
- **U2 — Plan card "Save" button** is the only action; when nothing has changed it should disable (dirty-check the draft against `plan`). Saves a needless DB write + a toast.
- **U3 — Bus markers older than 30 min should fade** — currently shown at full opacity forever. `drawBusMarkers` should compute age and lower alpha.
- **U4 — Day-banner copy** *"Parade day. Keep Location on; signal may not matter."* → *"Parade day. Keep Location on. Signal will be patchy."* clearer.
- **U5 — Side tings empty-add path** — once B2 is fixed, the empty state could also show the same `+ Add` button bigger.
- **U6 — Chant cards default-open** — `BanterScreen` opens the first chant by default (`banter.chants[0]?.id`). That eats vertical space and competes for attention. Recommend default-closed.
- **U7 — Cheer counter persistence** — the cheer counts persist across visits which is correct (it's a personal tally), but there's no "Reset tally" button. Add a small `↻` icon in the cheer card head.
- **U8 — Route status surfaced** — `pack.event.status === 'route-tbd'` is the current state. Surface it: a small `route provisional` chip near the wordmark or in the readiness chip's second line.

---

## 8. Pickup list — two phases (aligned with codex feedback)

### Phase 1 — quick correctness pass (cheap, high-leverage)

| # | Item | Section |
|---|---|---|
| 1 | Fix Banter poll honesty (hide bars when local-only; show "your pick" chip) | §B1 |
| 2 | Side tings paste/import sheet | §B2 |
| 3 | Watch-with-no-room toast | §B3 |
| 4 | Outside-click + Escape dismiss for topbar menu and name-editor sheet | §B4, §B5 |
| 5 | Improve onboarding first slide — explain what the app is before asking for a name | §F1 |
| 6 | First-launch "Saved offline" celebration toast | §F3 |
| 7 | Persistent no-GPS hint after 5 s | §N5 |

### Phase 2 — map detail (the user's headline ask)

| # | Item | Section |
|---|---|---|
| 8 | Verify platform SW behavior in DevTools (no new SW added) | §5 |
| 9 | Annotated richer basemap WebP (street names baked in) | §6 Layer A |
| 10 | Extend POI kinds + bake 50-80 manually checked practical POIs | §6 Layer B |
| 11 | POI category filters in LayerToggleRow | §M1 |
| 12 | POI tap → bottom sheet with name · distance · "Walk this way" | §M2 |
| 13 | Quick-find chips (toilet · water · station · pub · food) | §M3 |
| 14 | Numbered route/schedule markers | §M5 |

### Phase 3 — polish (try to land before parade)

| # | Item | Section |
|---|---|---|
| 15 | "Parade is tomorrow" eve-of banner | §B8 |
| 16 | "Set your name" CTA in Group solo state when name is `Me` | §F4 |
| 17 | Distance-to-route chip + walking compass | §M4, §M6 |
| 18 | Bus timing collapse-to-chip post-departure with "now" marker | §B7 |
| 19 | About sheet with version + sources | §B6 |
| 20 | T-30 parade-start toast | §N2 |
| 21 | Save button dirty-check | §U2 |
| 22 | Bus markers fade with age | §U3 |
| 23 | Chant default-closed; cheer reset button | §U6, §U7 |
| 24 | Day-banner + status copy polish | §U4, §U8 |
| 25 | Font weight audit — drop unused woff2s from precache | §O2 |

### Phase 4 — post-launch / nice-to-have

| # | Item | Section |
|---|---|---|
| 26 | Crowd movement guide arrows (Layer C) | §6 Layer C |
| 27 | Tab badge for unread chat signals | §N1 |
| 28 | Pack-stale warning in readiness chip | §O4 |
| 29 | Toast queue (max 3 stacked) | §N4 |
| 30 | Native browser push notifications | §N6 |
| 31 | Banter poll relay broadcast (real aggregation) | §B1 v1.1 |

---

## 9. Decisions for you (gate the build)

1. **Map basemap upgrade — keep the schematic and add an SVG street-label layer, or bake a richer annotated webp?**
   - SVG label layer keeps the current basemap (62 KB) and adds ~20-40 KB SVG text labels; pannable but more complex render.
   - Richer annotated webp: ~150-200 KB once, simpler to render, less code.
   - Recommend **richer webp** — simpler, smaller cognitive load, fits the "schematic" feel.

2. **POI sourcing — manual curation (codex preference), or OSM Overpass + manual QA?**
   - Manual: ~5-8 hours of work, perfectly curated for parade, ~50-80 POIs.
   - OSM-assisted: ~30 min Overpass query + ~2 h QA, more comprehensive (200+) but noisier.
   - Codex recommends **manual** for the parade pack (smaller, hand-checked). I'll defer to that — pick whichever you prefer.

3. **Banter polls v1 — hide counts entirely, or show "you and N others"?**
   - Hide counts: honest, no bar, just a "your pick" chip on the selected option.
   - Show "you and N others": requires real relay aggregation (defer).
   - Recommend **hide counts in v1**, ship relay aggregation in v1.1.

4. ~~Service worker — wait on platform, or own it in the showcase?~~
   **Resolved against HEAD:** the platform SW already precaches parade `runtime_assets` via `shippie.json → runtime-precache.ts → /__shippie-pwa/sw.js install handler`. The showcase **must not** add a competing SW. See §5 for the verification checklist.

---

## 10. Hard rules carrying in

1. **Offline still trumps everything.** New POIs cache with the route pack; new map detail caches with the basemap; nothing new in this round can fail loudly when offline.
2. **No relay-dependent UI in P0.** Polls show "local" honestly; chat signals stay on the local store; cheers stay personal.
3. **POI tap UX must be one-handed.** Bottom sheet, primary action visible, easy back.
4. **No new fonts, no new colors.** All map detail respects the existing palette (paper / ink / red / sage / gold / line).
5. **Keep the schematic feel.** This isn't Google Maps. It's a parade-specific brochure that happens to know where you are.
6. **4 tabs is still the ceiling.** All POI features fit into the existing Map tab.

---

## 11. What I'd build first if I had two hours

The cheapest, most user-visible wins are the **Phase 1 correctness pass** — every item is small and removes a friction or dishonesty already in the app:

1. **Banter poll honesty fix** (§B1) — ~5 lines, stops the UI from lying.
2. **Side tings paste sheet** (§B2) — unblocks the WhatsApp-code path real fans will use.
3. **Watch-no-room toast** (§B3) — one toast removes a silent dead end.
4. **Outside-click + Escape dismiss** (§B4, §B5) — basic crowd-usable polish.
5. **Onboarding first slide rewrite** (§F1) — give the app a 1-sentence identity before asking for a name.
6. **Saved-offline celebration toast** (§F3) — fires once on cache `ready`.
7. **Persistent no-GPS hint** (§N5) — empty-state above the tap panel after 5 s.

Phase 1 is maybe a half-day of work, lands the most embarrassing fixes, and leaves the surface clean for Phase 2's bigger map detail lift. Phase 2 is the user's headline ask — annotated basemap + 50-80 POI bake + category filters + tap-to-detail + quick-find chips + numbered route markers. That's the round where the map stops being a wireframe and starts being a guide.
