# Parade Companion — Handoff Report for Codex

_Written 2026-05-22 after a review/QA pass on branch `codex/parade-companion`._

## Status: branch is GREEN ✅

`bun run typecheck` clean · `bun test src` → **25/25 pass** · `bun run build` succeeds. This is a safe checkpoint.

## ⚠️ Concurrency collision — read this first

This uncommitted branch was being edited by two agents at the same time. A simplification pass
(collapsing `bus.ts`/`bus_marker` into the fan event, deleting dead files) **collided with your live
work and was reverted** — `shippie-db.ts` and `shippie.json` were restored to your `bus_marker`
version mid-pass. To avoid leaving the branch corrupted, that pass was rolled back to your coherent
state. **Recommendation: one agent owns this branch at a time.** Either finish + commit, then hand
off for review; or pause while a review pass runs. The collision was only recoverable because
nothing is committed yet.

## What this session changed (full transparency)

1. **Deleted `src/screens/GroupScreen.tsx`.** It was unreachable (not imported by `App.tsx`) and
   still referenced a `groupPositions` prop you removed from `CorridorMap`, so it broke `tsc`.
   Removing it matches your current nav (Pulse · Map · Plan · Meet · Safety · Card).
   `group-room.ts` and `group-types.ts` are now unused — safe for you to delete too.
2. **Regression I caused in `fan-events.ts` — please re-apply:** a `git restore` reverted
   `FAN_EVENT_LABELS.need_help` from `'Mark help spot'` back to `'Need help'`. Your PulseScreen B1
   safety copy (the "Move to a steward or call 999" status + "QR only" hint) is **intact** — only
   this one label string regressed. Re-apply `need_help: 'Mark help spot'`.
3. Nothing else of mine remains; over-eager file deletions were restored.

## What you've already done well (reviewed)

From the QA plan (`2026-05-22-parade-companion-qa-and-improvements.md`), already done:
A1 ReadinessChip · A2 Map battery-saver default · B2 "Lost?" button · B4 bus double-draw guard
(`!hasFanBus`) · B5 Map as the landing screen · D1 fan-event pruning + cap · D3-partial
(`aria-current`, accessible canvas-map summary). That is solid progress.

**S1 (bus → fan-event collapse) is closed as "won't do"** — you deliberately kept the `bus_marker`
table, and B4's `!hasFanBus` guard already prevents the double-draw. Fine.

## Outstanding work

Severity per the QA + simplification plans.

**P1**
- **Dead code (QA C1 / Simp S3):** delete `src/screens/ReadyScreen.tsx` (superseded by
  `ReadinessChip`), `src/lib/group-room.ts`, `src/lib/group-types.ts`. Confirm and remove
  `src/lib/bus-pulse.ts` + `bus-pulse-types.ts` and the platform `parade/bus-pulse` endpoint/route/
  test — no client code calls that endpoint.
- **B3 — Card share is non-functional as an artifact:** `CardScreen` emits an SVG `data:` URL.
  "Save card" downloads a `.svg` (Instagram needs a raster); "Share text" shares text only, never
  the image; the SVG uses `Georgia`/`Arial`, not the brand fonts. Render the card to PNG on a
  `<canvas>` with the brand fonts and share via `navigator.share({ files })`.
- **S2 — one GPS source:** `MapScreen`, `PulseScreen`, `MeetScreen` each call `watchGps`
  independently → re-acquisition lag on every screen switch. Lift one `watchGps` to `App`, pass
  `gpsFix` down.

**P2**
- D2 — a fan event tapped outside `CORRIDOR_EXTENT` is saved but silently filtered on read; surface or block it.
- D4 — `drawPois` sets a dead `system-ui` canvas font line (remove it); darken `--ink-mute` micro-copy for sunlight.
- D5 — personalised bus ETA ("expected near you ~HH:MM") from `scheduleEstimate` + GPS.
- D3 remainder — `prefers-reduced-motion`; OS-scalable sizes for the fixed-`px` mono micro-labels.

**Needs a user decision (Simplification plan S4/S5)**
- S4 — merge Plan + Meet into one screen.
- S5 — trim the Pulse action set (cut `crowd_dense`?), demote Card from a nav tab to a Pulse action.

## Before launch
Re-run the five QA review passes as a release checklist, then the device matrix (older iPhone
Safari + Android, airplane-mode + Location-on cold start). No browser-automation tool was available
this session — the button-by-button click-through is still a human/`/ultrareview` gate.
