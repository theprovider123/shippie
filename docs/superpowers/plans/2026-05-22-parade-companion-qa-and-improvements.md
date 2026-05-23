# Parade Companion — QA Review & Improvement Plan

> Companion to `2026-05-22-parade-companion.md` (build plan) and `-design.md` (design system).
> Reviewed: `apps/showcase-parade-companion` on branch `codex/parade-companion` at 2026-05-22, after codex's
> fan-events / Pulse / Card extension. Baseline health: typecheck clean, **23/23 tests pass**, build succeeds.

**Headline:** no crash-level bugs — the app builds and runs. But codex pivoted the networked layer
(server "Bus Pulse" relay → offline phone-to-phone QR "fan events") and left regressions, dead code,
and gaps. Two are **P0 for parade day**: there is no longer any offline-readiness check, and the Map
screen drains battery by default. Severity key: **P0** = can fail users at the parade · **P1** =
significant · **P2** = polish.

---

## Five review passes

### Pass 1 — Offline / zero-signal correctness (the core promise)
- **[P0] No offline-readiness affordance.** `ReadyScreen.tsx` is no longer imported by `App.tsx`. The
  user gets no "✅ saved to your phone / ⚠️ open on Wi-Fi to finish" confirmation. Arriving with the
  app un-cached is the single biggest real-world failure mode, and it is now invisible.
- **[P2]** QR sync only works if *both* phones already cached the app (a scanned `#fragment` URL still
  has to load the app). Disclosed in the QR sheet copy — acceptable, but needs a louder pre-parade nudge.
- ✅ Good: route pack is baked, fonts self-hosted + in `runtime_assets`, core screens make no network calls.

### Pass 2 — Crowd / stress UX (separated, panicked, one-handed, sunlight, dying battery)
- **[P0] Map screen drains battery.** `MapScreen` calls `watchGps({ batterySaver })` with `batterySaver`
  defaulting to `false` → continuous high-accuracy `watchPosition` for a multi-hour event. `PulseScreen`
  correctly defaults to `true`. A phone that dies at 2pm helps nobody.
- **[P1] "Need help" gives false reassurance.** Tapping it saves a *local-only* `need_help` event and
  shows "Help marker saved nearby." It summons no one. A panicked user may believe help is coming. The
  999/steward instruction must dominate; reframe the tap as "mark it so your group sees it on QR sync."
- **[P1] No prominent panic / "lost" affordance.** The compass-to-meeting-point is buried behind the
  Meet tab. A separated person should not fumble six nav tabs in a crush.
- **[P2]** `--ink-mute` (50% ink) at 10px mono is marginal in direct sunlight.

### Pass 3 — First-time / cold-open user
- **[P1] Weak cold open.** Landing screen is hard-coded to `pulse`, which shows a `0 / 0 / 0` ledger.
  The design's hero is the **Map** ("70% of the app"). An empty Pulse under-sells on first open.
- **[P1] No pre-parade setup flow.** With `ReadyScreen` gone, a first-timer gets no "do this before you
  go" guidance — exactly when it matters most.
- **[P2]** Pulse zero-state could read more warmly than three zeros.

### Pass 4 — Code correctness & dead code
- **[P1] Dead-code cluster.** Confirmed unreferenced: `ReadyScreen.tsx`, `GroupScreen.tsx`,
  `lib/group-room.ts`, `lib/group-types.ts`, `lib/bus-pulse.ts`, `lib/bus-pulse-types.ts`, and
  `CorridorMap`'s `drawBusPulses` / `drawGroupPositions` paths (`busPulses` / `groupPositions` are never
  passed non-empty). Orphaned platform-side: `apps/platform/src/lib/server/parade/bus-pulse.ts` + test +
  `routes/__shippie/parade/bus-pulse/+server.ts` — no client calls them. The Rung-1 server relay was
  superseded by offline QR sync but never removed.
- **[P1] Stale manifest.** `shippie.json` still declares the `privateRelay` capability and the
  `data_passport` describes a relay — inaccurate now that no relay is used.
- **[P1] Bus draws twice on the map.** `onBusHere` creates *both* a `BusMarker` and a `bus_seen`
  `FanEvent`; `CorridorMap` renders both → a "Bus tap" dot and a "Bus seen" cluster at the same spot.
- **[P2] `fan_event` table grows unbounded.** Expired events are never pruned (`clearFanEvents` exists,
  is never called). A long parade with many QR syncs bloats local storage and every `summarize`/`cluster`.
- **[P2] Silent loss outside the corridor.** A fan event created outside `CORRIDOR_EXTENT` is saved but
  filtered out by `validateFanEvent` on every read — the user sees a success toast + haptic, nothing appears.
- **[P2]** `drawPois` sets a dead `system-ui` canvas font (always overridden by `drawLabel`).
- ✅ Good: the prior `loadGroupPlan` unwrap bug and `bus_marker` schema gap are fixed and still correct.

### Pass 5 — Accessibility, device diversity & brand fidelity
- **[P1] The shareable Card doesn't actually share.** It is an SVG `data:` URL: "Save card" downloads a
  `.svg` (Instagram needs a raster image); "Share text" shares text only, never the card image. The
  viral mechanic is non-functional.
- **[P1] Card is off-brand.** The SVG uses `Georgia` / `Arial` / `monospace`, not Fraunces / General
  Sans / JetBrains Mono — SVG-in-`<img>` is font-isolated, so the brand fonts never apply.
- **[P2]** Canvas map is `aria-hidden` with no accessible text alternative — blind users get nothing
  from the route/POIs/GPS. **[P2]** bottom-nav active tab lacks `aria-current`. **[P2]** no
  `prefers-reduced-motion`; fixed-`px` mono micro-labels don't scale with OS large-text. **[P2]**
  `aspect-ratio`/`dvh` degrade on iOS < 15.4 (low priority — minority of devices).

---

## Feature improvements (technical + UX)

1. **Offline-readiness indicator (UX + tech).** Restore a lightweight, always-visible "Saved for
   offline ✓ / Open on Wi-Fi to finish" chip + route-pack freshness — verified against the Cache API.
   Not a full screen; a slim banner honoring the design's anti-onboarding ethos.
2. **Panic / "Lost" mode (UX).** One prominent, always-reachable control → full-screen reunion view:
   meeting point, compass arrow, straight-line distance, and the steward coordinate card.
3. **Card → real raster share (tech + UX).** Render the card to PNG via an offscreen `<canvas>` using
   the brand fonts, and share the actual image file via `navigator.share({ files })` with a download
   fallback. Makes the share feature deliver.
4. **Prune + cap fan events (tech).** Drop events past `expires_at` on load and cap row count — keeps
   the app fast and local storage bounded over a long event.
5. **Personalised bus ETA (UX).** Replace the static `scheduleEstimate` list with "bus expected near
   *you* ~HH:MM," computed from the schedule + the user's position along the route.
6. **Resolve the relay's fate (tech).** Either delete the dead Rung-1 cluster + orphaned platform
   endpoint, or re-wire the group relay screen — and make `shippie.json` capabilities honest either way.
7. **Accessibility pass (a11y).** `aria-current` on nav, an accessible text summary of the map state,
   `prefers-reduced-motion`, and OS-text-scalable label sizes.

---

## Remediation plan

Branch off `codex/parade-companion`. Each phase ends green on `bun run typecheck && bun test src && bun run build`.

### Phase A — P0, must land before launch
- **A1 Offline-readiness:** add a slim `<ReadinessChip>` rendered above the screen host (or in the
  topbar). Reuse `ReadyScreen`'s `caches.match` logic against the `runtime_assets` URLs; show ✅/⚠️ +
  `packFreshnessLabel(pack)`. Files: new `components/ReadinessChip.tsx`, `App.tsx`.
- **A2 Battery:** in `MapScreen`, default `batterySaver` to `true` (match `PulseScreen`); keep the
  toggle so users can opt into high accuracy. File: `screens/MapScreen.tsx`.

### Phase B — P1, safety + core features
- **B1 "Need help" reframe:** relabel to "Mark help spot," lead the status copy with "Move to a
  steward or call 999 now," and make clear the marker only travels by QR sync. File: `PulseScreen.tsx`,
  `fan-events.ts` (`FAN_EVENT_LABELS`).
- **B2 Panic/Lost mode:** new `LostOverlay` — a full-screen reunion view triggered by a persistent
  button (e.g. in the topbar). Files: new `components/LostOverlay.tsx`, `App.tsx`; reuse `MeetScreen`
  compass logic.
- **B3 Card raster + brand fonts:** render the card on a `<canvas>` (load the woff2 via `FontFace`),
  export PNG, `navigator.share({ files: [pngFile] })` with download fallback. File: `CardScreen.tsx`.
- **B4 Bus double-draw:** stop creating a separate `BusMarker` when a `bus_seen` `FanEvent` already
  represents it — render the bus once. Files: `MapScreen.tsx`/`PulseScreen.tsx` `onBusHere`,
  `CorridorMap.tsx`.
- **B5 Landing screen:** default to `map` (or date-aware: `map` on parade day) and give Pulse a warm
  zero-state. File: `App.tsx`, `PulseScreen.tsx`.

### Phase C — P1 hygiene
- **C1 Resolve the relay:** decide delete-vs-rewire (recommend **delete** for v1 — the offline QR model
  is the on-brand one). Remove `ReadyScreen.tsx` (its logic now lives in A1), `GroupScreen.tsx`,
  `group-room.ts`, `group-types.ts`, `bus-pulse.ts`, `bus-pulse-types.ts`, `CorridorMap`'s dead draw
  paths, and the platform `parade/bus-pulse` endpoint/route/test.
- **C2 Honest manifest:** drop `privateRelay` from `shippie.json` capabilities; update `data_passport`
  to describe QR sync, not a relay.

### Phase D — P2 polish
- **D1** Prune expired `fan_event` rows on load + cap count (`shippie-db.ts` `listFanEvents`).
- **D2** Surface or block out-of-extent taps instead of silently dropping them (`fan-events.ts`).
- **D3** A11y: `aria-current` on nav, accessible map summary, `prefers-reduced-motion`, scalable labels.
- **D4** Sunlight contrast: darken `--ink-mute` usage for micro-copy; remove the dead `drawPois` font.
- **D5** Personalised bus ETA (improvement #5).

### Verification
- After every phase: `bun run typecheck && bun test src && bun run build`, plus a prod-base build
  (`bunx vite build --base=/__shippie-run/parade-companion/`).
- **Re-run all five passes** as a release checklist before launch.
- Device matrix (per the build plan, Part 12): older iPhone Safari + Add-to-Home-Screen, Android
  Chrome, low-end Android — each with the airplane-mode + Location-on cold-start test.
- Manual click-through of every button on all six screens (no browser-automation tool here — this is
  a human/`/ultrareview` gate).

---

## Priority summary

| Do now (P0) | Before launch (P1) | Polish (P2) |
|---|---|---|
| A1 readiness chip · A2 battery default | B1 help reframe · B2 lost mode · B3 card share · B4 bus dup · B5 landing · C1 dead code · C2 manifest | D1 prune · D2 extent · D3 a11y · D4 contrast · D5 bus ETA |
