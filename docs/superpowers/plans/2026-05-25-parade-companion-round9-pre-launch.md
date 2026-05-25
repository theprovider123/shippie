# Round 9 — Pre-launch polish · Map-first layout · Offline & sync hardening

> **Branch state at write:** `7eb20de1 fix(showcase): clarify parade map anchors` on `review-implementation-2026-05-23` — typecheck clean, 76/76 tests, build OK. Bundle: CSS 8.11 KB gz, JS 122.31 KB gz.
>
> The app is feature-complete. This round is **simplification and last-mile polish** for the launch — the things you only notice in a real pre-launch dry-run with one thumb in a crowd.

---

## 1. What's already done since round 8

Codex shipped 8 more commits (round 8 → 9 gap), adding:

| Area | What landed |
|---|---|
| Sync infrastructure | `lib/live-sync.ts` (publish + pull via `/__shippie/parade/fan-pulse`), `LiveSyncStrip` (status row), 20 s poll + on-online sync, quantized coordinates for privacy |
| Live route pack | `syncRoutePack` to `/__shippie/parade/route-pack`, cache-busted, written to localStorage; toast on update |
| Auto-save | `lib/offline-save.ts` posts `DOWNLOAD_APP` to the platform SW via MessageChannel, plus a showcase-side `parade-companion:islington-detail:v1` cache fallback for the heavy assets — fires automatically on load |
| Location language | `lib/parade-grid.ts` (offline 10 m grid `A-001`-style codes), `lib/location-labels.ts` (titles like *"on route · 40m east side · near Drayton Park · D-024"*) — used across CrowdCompass, GoalPointer, and the Around-you panel |
| Find mode | `GoalPointer` overlay row with phone-compass + heading correction; arrow rotates relative to user's facing |
| Crowd compass | `CrowdCompass` panel — sorts active fan-event clusters by count and points at the top 3 |
| Bus timing presentation | `lib/parade-time.ts` — `currentIndex` highlight, collapse-to-chip 30 min after start, `isParadeEve` / `isStartPromptWindow` helpers; T-30 toast fires once per device per parade |
| Onboarding | Privacy panel on slide 2 (private / group / public pulse), supporter-tag note on slide 1 |
| Banter | `lib/banter.ts` adds `pollOptionLabel`, `selectedTriviaAttempt`, `answerTrivia`; BanterScreen gets a Season-debate trivia card with prev/next, optional `otherOptions` for polls |
| Quick-find | Trimmed to `toilet / water / station / atm` (food/pub dropped — *"volatile open/closed data travels through peer reports, not the static pack"*) |
| Topbar | About sheet, escape-dismiss for menu/sheets/about, supporter handle in identity |
| Reports | `toilet_queue` promoted to a primary tap (3 fast taps + more reports below), `food_open` retained as a peer report only |
| Bus marker | Age-based fade (`busMarkerAlpha`), "Old bus tap" relabel past 30 min |
| POI map detail | Mini labels for tube exits / landmarks / stations / first aid; collision-aware edge clamping |
| Route pack | Schema-validated POIs inside corridor extent; pack timestamp bumped to `2026-05-24T23:05:00+01:00` |

That's a lot. The result is a sophisticated, locally-sovereign parade app. The remaining issues are **density and ordering**, not capability.

---

## 2. The one big problem worth fixing — map dominance

### Symptom

On a 667 px iPhone SE, the MapScreen renders chrome in this order before you see any of the corridor map itself:

```
┌─────────────────────────────────┐
│ topbar (52)                     │
│ wordmark band (24)              │
│ readiness chip (40)             │
│ ────────  screen-host scroll ───┤
│ tap panel — 3 buttons (124)     │
│ quick-find chips (38)           │
│ layer toggles summary (32)      │
│ live sync strip (32)            │
│ status strip (44)               │
│ goal pointer (when active, ~76) │
│ ── visible cut-off here on SE ──┤
│ corridor map (1:1 square)       │
│   ...                           │
│ around you panel                │
│ timing chip / panel             │
└─────────────────────────────────┘
```

**The map is below the fold on most phones.** It's the headline artifact, and it's not the first thing you see. The chrome stack above it is also *redundant* — LiveSyncStrip and StatusStrip both report system state in one row each, and the "Around you" panel duplicates information that's already on the map.

### Fix — three moves

1. **Move the corridor map to the top of the screen-host scroll**, immediately after the readiness chip. Map is the orienting surface; everything else is context for the map.
2. **Fold LiveSyncStrip into StatusStrip** as a fourth cell on the right (small dot + count). Both are status; one row, not two.
3. **Make the tap panel sticky-bottom** within the screen-host scroll, above the bottom nav. One-handed reach without taking real estate off the map.

### New order

```
topbar / wordmark / readiness
─── screen-host scroll ───
[CorridorMap]              ← first thing seen
status-strip (GPS · Route · Sync · Battery · QR)
GoalPointer (when active, overlay on map top-right OR inline)
quick-find chips + layer-toggle stack
around-you (only if it shows something not already on map)
timing chip / panel
─── screen-host scroll end ───
[sticky tap-panel]         ← always at thumb
bottom-nav
```

### Bonus simplifications

- **Drop the "Around you" panel entirely** when nothing new to add. With GoalPointer + map clusters + CrowdCompass, this is the third surface for the same data. Keep the empty-state ("Quiet for now…") only — and even that's better as a one-line note under the status strip.
- **Move CrowdCompass into the StatusStrip area** as a one-line "Crowd compass: bus 240m NE · pubs west" pill when there are active signals — full panel only when expanded.

---

## 3. Map-itself improvements

### M1 — Sticky map header strip

Below the map, a tiny mono strip showing what's currently surfaced: `BUS · 240M NE · D-014` or `FIND: TOILET · 60M S`. This is the always-visible answer to "what is this map showing me." Replaces the noisier "Around you" panel.

### M2 — Recenter / reset-zoom button

When pan/zoom is non-default, a third button appears under the +/- pair: `⊙ Center`. Resets `offset={0,0}` and `scale=1`. Without it, fat-fingered zoom strands the user.

### M3 — DPR-aware basemap

Today: 62 KB schematic webp at 1800×1800. On retina (DPR 2-3), that's already pixelated when zoomed. Two options:
- **Bake a 2x WebP** (~120 KB once, cached forever) for sharper text and street labels.
- **Add an SVG label overlay** (~20 KB) with street names that scale without losing crispness — kept separately so the WebP can stay light.

I recommend **2x WebP** — simpler render path, no SVG/canvas z-ordering puzzle.

### M4 — POI label collision pass

Today `drawLabel`'s edge-clamp prevents going off-canvas, but with 13+ POIs visible at zoom 1 (5 tube-exit + 4 toilet + 4 water + 4 atm + landmarks), labels overlap visibly. Strategies (cheapest first):
- **Drop labels for water/atm/toilet at scale ≤ 1.5×** (only show their glyph). Show labels only when the user has zoomed in.
- **Two-pass layout:** lay landmarks first, then place smaller categories in remaining whitespace via a simple AABB collision check.

Land the cheap one. Defer the AABB until we see if the cheap one is enough.

### M5 — Walk-line clearer

`drawWalkLine` is a dashed sage line from GPS to target. Add a small arrowhead at the target end, and a `~120 m` label at the midpoint so the user knows the distance without crossing back to the GoalPointer row.

### M6 — Map credit chip

`map-credit` currently sits at bottom-left of the map. It's correct (*"Offline schematic. Verify official route before travel."*) but heavy. Reduce to a single mono-italic line at smaller size; collapses to `?` icon on touch and expands on tap.

---

## 4. Offline & loading improvements

### O1 — First-launch loading skeleton

Today: between `useState(() => loadRoutePack())` (sync) and the various async stores (`loadGroupPlan`, `listBusMarkers`, `listFanEvents`) hydrating, the user sees the full chrome immediately but with **empty panels and no GPS dot for ~1-2s**. Add a one-line skeleton state in the map and tap-panel that says *"Loading saved data…"* and fades once the localStorage / shippie.db reads resolve.

### O2 — Visible save-offline progress

`saveParadeOffline` returns `{ done, total }` via the SW MessageChannel's `progress` messages. Surface this:
- On first load, a small chip below the ReadinessChip: `Saving 4/9…` → `Saved offline · 9/9`.
- Gated by `shouldCelebrateOffline` so it doesn't re-fire on every load.

### O3 — Pack-stale warning

`readinessChip` says `"pack 24 May 2026 · 23:05"` always. If `now - packVersion > 14 days`, add a sage-bordered warning: *"Pack stale — open on Wi-Fi for the latest route"*. This was a P2 from round 8.

### O4 — Battery-aware live sync

Today `App.tsx` polls `/__shippie/parade/fan-pulse` every 20 s regardless. With the parade lasting ~75 minutes plus pre/post travel, that's 225+ requests over 2 hours from every active phone. Tier the cadence:
- **Battery-saver ON** → 60 s
- **Battery-saver OFF & visible** → 20 s
- **`document.hidden`** → pause (resume on visibility)

Also add **exponential backoff on `'failed'`**: 30 s → 60 s → 120 s cap, reset on first success.

### O5 — Manual sync tap target

LiveSyncStrip is presentational only today. Make it a button — tap runs `runCrowdSync('tap')` and toasts the result. Useful when a fan steps into Wi-Fi and wants to push their last bus sighting.

### O6 — Background sync API

Modern browsers (Chromium-based) support `navigator.serviceWorker.ready.then(reg => reg.sync.register('parade-fan-pulse'))`. The platform SW could pick this up and post when network returns. Defer — needs platform-side work, but log a P2 item.

### O7 — Pre-launch DevTools verification (manual)

Five-step check on a real instance before launch:

1. Open `/run/parade-companion/` in a fresh profile.
2. Application → Service Workers — platform SW `activated and running`.
3. Application → Cache Storage — assert `/__shippie-run/parade-companion/basemap/corridor.webp`, `…/route-pack.json`, all 7 `…/fonts/*.woff2`.
4. Toggle to Offline → hard-reload → confirm map renders, fonts load, **GPS dot still draws** when emulated coords are set.
5. Verify ReadinessChip flips to `Saved offline` within ~6 s (uses the `[0, 1200, 4000]` ms cascade).

---

## 5. UX & copy polish

### U1 — "Three fast taps" copy

Tap panel header reads *"Three fast taps"*. With the `More reports ▾` expander showing `crowd · road · food · help` underneath, that's six taps. Better: **"Quick tap"** + small `more` link, no overpromise.

### U2 — Day banner clarity

*"Parade day. Keep Location on; signal may not matter."* — confusing. Better: *"Parade day. Keep Location on. Signal may be patchy."*

### U3 — Status strip "Route" semantics

`Route` cell shows distance to nearest route segment. When user is *on the route* (< 18 m), it shows `0 m`. Better: when on-route, show `on route`. When off-route, the number. Currently `lib/geo.ts → formatDistance(0)` = `0 m`, which feels wrong.

### U4 — Onboarding skipper safety net

If user skips onboarding, displayName defaults to `Me`. The supporterTag is still set. But there's no in-context nudge later. Add a `Set your name` button in the Group identity card's solo state when `displayName === 'Me'`.

### U5 — Group screen `Group name` redundancy

`GroupScreen` Plan card has *"Group name"* input. `GroupIdentityCard` shows the group name above it. Editing name in Plan re-renders both. Consolidate — tap the identity card name to inline-edit, drop the Plan card field.

### U6 — Bottom-nav scroll-to-top on re-tap

Today, tapping the active tab does nothing. Common iOS pattern: tap-the-active-tab scrolls the screen-host to top. Cheap win.

### U7 — Side-tings empty-state CTA

The empty state currently says *"Add a friend's QR to watch their crew here."* Add a real big `+ Add` button instead of the small one tucked next to the heading. The header `+ Add` is hard to find for first-time users.

### U8 — Chant card auto-close on next tap

In BanterScreen, opening one chant should auto-close the previously-open one. Already mostly true via `openChantId` single state, but the head animation can feel laggy. No code change, just verify.

---

## 6. Accessibility polish

### A1 — aria-live on the goal pointer

GoalPointer is `role="status" aria-live="polite"`. Good. But when the target *changes*, screen readers re-read the entire status. Lower `aria-relevant` to `text` and use a sentence form: *"Find mode now points to Drayton Park, 240 metres northeast."*

### A2 — Map summary refresh on cluster change

The `<p id="corridor-map-summary" className="sr-only">` is generated once at component render. With `aria-live="off"` (the default), changes don't announce. Either drop the live region or wrap with `aria-live="polite"` so a screen reader user hears *"Bus sighting added 30 metres east of you."* Subtle — but defines whether the offline experience is usable for low-vision fans.

### A3 — Focus-visible for keyboard users

Most buttons have `:active` styles but not `:focus-visible`. Add a 2 px sage outline to the design system's `button:focus-visible` selector for the rare keyboard user (and the iPad-with-keyboard pre-launch tester).

### A4 — Reduced motion

Chant rows, sheet slide-ins, and the GoalPointer arrow rotation should respect `@media (prefers-reduced-motion: reduce)`. Audit + add `transition: none` overrides.

---

## 7. Bugs / cleanup

| # | Issue | Fix |
|---|---|---|
| B1 | StatusStrip "Route" formatDistance returns "away" only above 50 km, but "off route" above 5 km — both reachable on a London Underground commute. Threshold OK, but copy reads as alarming. | Use `more than 5 km` instead of `off route` |
| B2 | `App.tsx:50` `[supporterTag]` is a state but never updates; could be `useMemo` | Switch to `useMemo` for clarity |
| B3 | Schedule markers ①②③ on canvas — always render even outside zoom — could collide with tube-exit labels at zoom 1 | Add 80 px y-offset (already done — verify it doesn't go off top edge for stadium-area row) |
| B4 | `aria-hidden` map summary — set on the wrong element (we want the canvas hidden, not the summary) | Audit `aria-hidden` placement |
| B5 | `Toast` 2.5 s default — for the new `Parade starts soon` warning, that's too short | Tier toasts: warn = 4 s, success/default = 2.5 s |
| B6 | Bus marker `busMarkerAlpha` decays after 60 min to 0.32. After ~3 hours the canvas has invisible-but-present markers. Cull > 4 h. | Filter `busMarkers` by age in MapScreen before passing to CorridorMap |
| B7 | `routeDistance` and `nearestPoi` recompute on every GPS fix — fine, but `pack.pois.map(...)` is O(n) on every render | Memoize differently (already useMemo'd but deps include gpsFix which changes often). Acceptable for n=34. |

---

## 8. Net-new ideas to brainstorm later (NOT for this round)

1. **Share static location to family via SMS template** — one-tap "I'm at D-014 at 14:23 (parade)" copy-to-clipboard for non-app users.
2. **Apple Wallet pass** — generates a `.pkpass` with route polyline + start time + supporter tag for parade day reference.
3. **Background sync API** — register tasks for fan-pulse publish when the browser regains network without the app open.
4. **Web Bluetooth proximity sync** — phone-to-phone fan_event hop without internet (pre-launch BLE is fragile, defer).
5. **Crowd-sourced bus position smoothing** — when 3+ bus_seen pulses land within 90 s, average and animate a moving marker.
6. **Parade replay** — post-event mode that shows the bus trail on the corridor with timestamps.

---

## 9. Phases

### Phase 1 — Map dominance (P0)

1. Reorder MapScreen — map first, status strip second, chips third, panels last, tap-panel sticky bottom.
2. Fold LiveSyncStrip into StatusStrip as a 4th cell.
3. Drop the "Around you" panel; add a one-line `.map-status` strip under the map.
4. Bottom-nav scroll-to-top on re-tap.

### Phase 2 — Map polish (P0)

5. Recenter button below +/- when pan/zoom non-default.
6. Drop water/atm/toilet labels at scale ≤ 1.5×.
7. Bus markers > 4 h culled in MapScreen.
8. Pack-stale warning when > 14 days old.

### Phase 3 — Sync hardening (P1)

9. Battery-aware sync cadence (20s/60s/paused).
10. Exponential backoff on `failed` (30s → 60s → 120s).
11. LiveSyncStrip → tap to manual-sync.
12. Save-offline progress chip on first launch.

### Phase 4 — Copy & a11y polish (P1)

13. Tap panel header copy fix.
14. Day banner copy fix.
15. Status strip "on route" copy.
16. focus-visible outline.
17. Reduced-motion overrides.
18. Toast variant durations (warn 4 s).
19. Set-your-name CTA in Group solo state.
20. Side-tings big `+ Add` in empty state.

### Phase 5 — Pre-launch verification (manual, P0)

21. DevTools 5-step offline audit.
22. Real-phone walk: iPhone Safari (PWA-install path) + Android Chrome.
23. Verify the platform SW precaches `parade-companion` runtime_assets and that ReadinessChip URL keys match the cache.
24. Charge-and-walk: 2-hour live test at low battery to validate the sync cadence drain.

### Phase 6 — Brainstorm only (P2)

25. The 6 net-new ideas from §8 — capture, defer.

---

## 10. What I'd NOT do this round

- **2x WebP basemap** (M3) — biggest visual win but needs design work (re-export from Figma). Schedule for post-launch v1.1 with the round-9 PR notes.
- **SVG label overlay** — same reasoning. Cleanup target for v1.1.
- **AABB POI label collision** — the cheap drop-at-zoom-1.5 fix is enough for launch.
- **Background sync API + Web Push** — platform-side work; defer.
- **Anything banter** — codex shipped the season-debate trivia card; the surface is rich enough.

---

## 11. Hard rules carrying in

1. **Offline still trumps everything.** All changes in Phase 1-4 must work with `navigator.onLine === false`.
2. **No new fonts, no new colors.** Paper / ink / red / sage / gold / line. Period.
3. **Sticky positioning** in Phase 1 must respect iOS safe-area insets (already done via `env(safe-area-inset-bottom)` in `.bottom-nav`).
4. **No relay-dependent UI in P0.** Sync polish (Phase 3) is P1 — the app must still work as today if `/__shippie/parade/fan-pulse` 404s.
5. **The platform SW remains the offline backbone.** The showcase still must not register its own SW.
6. **4-tab nav stays.** Map · Group · Banter · Safety.

---

## 12. Health gate before launch

```
bun run typecheck   # green
bun test src        # ≥ 76 tests, all pass
bun run build       # CSS ≤ 10 KB gz, JS ≤ 130 KB gz
```

Plus the manual DevTools audit from O7 / Phase 5.21.

---

## 13. What I'd build first if I had 90 minutes

1. **Phase 1 reorder** — 30 min. Highest UX leverage.
2. **Map status strip replacing Around-you panel** — 15 min. Density win.
3. **Pack-stale warning** — 10 min. Travel safety win.
4. **Bottom-nav scroll-to-top + side-tings big add CTA** — 10 min.
5. **Save-offline progress chip** — 15 min.
6. **Status strip "on route" copy + tap panel header copy** — 5 min.
7. **Reduced motion + focus-visible** — 5 min.

That's a tight pre-launch polish run that turns the app from "feature-complete" into "phone-tested ready."
