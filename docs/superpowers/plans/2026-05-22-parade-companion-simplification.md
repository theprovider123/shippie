# Parade Companion — Simplification & Improvement Plan

> Third review of `apps/showcase-parade-companion` (branch `codex/parade-companion`, 2026-05-22).
> Companion to the build plan, the design system, and `-qa-and-improvements.md`.
> Lens this time: **simplification.** Baseline health is fine (typecheck clean, 23/23 tests, build OK).

## The core observation

The design brief was explicit: *"Minimal UI — every screen has ONE primary action. No onboarding.
Nothing to figure out. A beautiful calm utility amidst the chaos of 2 million people."*

The app has drifted from that. It now carries:
- **8 screen files** (6 live + 2 dead), 6 bottom-nav tabs.
- **Two parallel "bus" systems** — `bus.ts`/`BusMarker`/`bus_marker` table *and* the `bus_seen`
  `FanEvent`. Every bus tap writes both; the map draws both.
- **Three independent GPS watchers** — Map, Pulse, and Meet each call `watchGps` on mount.
- **Five tap types** plus a ledger, a status board, a sync panel, and a map shortcut all on the
  Pulse screen — that is not "one primary action."
- **~4,550 lines**, a 361-line `fan-events.ts` with grid-clustering and confidence tiers.

None of this is broken. But a thinner app is one you can actually test exhaustively before the day,
and one with fewer failure modes. **Simplification here is risk reduction.**

---

## Simplification opportunities (ranked by leverage)

### S1 — One bus, not two
`BusMarker` is a strict subset of a `bus_seen` `FanEvent` (same position, accuracy, segment snap,
time). The only delta is `expires_at`. Today `onBusHere` writes **both**, and `CorridorMap` draws
both → the bus appears twice (also flagged in the QA plan).
**Do:** delete `bus.ts`, `bus.test.ts`, the `bus_marker` table + schema, the `BusMarker` type and its
threaded props. A bus sighting is a `FanEvent`. Bump the `bus_seen` TTL to cover the full event day
(~360 min) so a morning tap still shows on the evening Card.
**Removes:** 2 files, 1 table, 1 double-draw bug, ~4 props through App/Map/Pulse/CorridorMap/Card.

### S2 — One GPS source
Map, Pulse, and Meet each run their own `watchGps`. Switching screens re-acquires a cold fix every
time, and the battery policy is set in three places (Map wrongly defaults to high-accuracy — QA P0).
**Do:** lift a single `watchGps` to `App`, hold `gpsFix` in App state, pass it down. One battery
policy (battery-saver default + one global toggle).
**Removes:** 2 redundant watchers, per-screen re-acquisition lag; resolves the QA battery P0 in one place.

### S3 — Delete the dead relay cluster
Confirmed unreferenced: `ReadyScreen.tsx`, `GroupScreen.tsx`, `lib/group-room.ts`, `lib/group-types.ts`,
`lib/bus-pulse.ts`, `lib/bus-pulse-types.ts`, `CorridorMap`'s `drawBusPulses`/`drawGroupPositions`
paths, and the platform `parade/bus-pulse` Worker + route + test. The Rung-1 server relay was
superseded by offline QR sync and never removed.
**Do:** delete it; drop the now-false `privateRelay` capability from `shippie.json`.
**Removes:** ~9 files + a platform route. (Absorbs QA plan C1/C2.)

### S4 — Merge Plan + Meet into one "Plan" screen
Plan *creates* the group plan; Meet *uses* it (compass, countdown, fallback, steward card). They are
two halves of one feature — and the original design had a single "Group" screen. Split across two
nav tabs, the user must mentally model "where do I make it / where do I use it."
**Do:** one screen — no plan → the form; plan exists → the Meet view with an "edit" affordance.
**Removes:** 1 nav tab; one mental model instead of two. (Highest-effort item — sequence it last.)

### S5 — Trim the Pulse screen back toward "one primary action"
Five tap types (`presence`, `bus_seen`, `crowd_dense`, `road_blocked`, `need_help`) + ledger + status
board + sync panel is a busy screen. `crowd_dense` is the weakest — in a crowd that can already see
it is crowded, a synced "too crowded" tag carries little signal (the strategy notes were harsh on
exactly this kind of feature).
**Do (proposal — your call):** cut `crowd_dense`; keep presence / bus / road_blocked / need_help.
Demote **Card** from a permanent nav tab to a secondary action on Pulse (it is a post-parade artifact;
a nav slot for it is dead weight 99% of the time).
**Result:** Pulse is calmer; bottom-nav goes 6 → **4 tabs** (Pulse · Map · Plan · Safety).

### S6 — Watch, don't cut: the clustering machinery
`clusterFanEvents` (grid-keying, `single/likely/strong` confidence) is ~70 lines that only pay off at
high event volume. It is written and tested — **do not churn it now** — but if QR-sync volume stays
low through launch, it can later collapse to a flat "recent events by type" list. Flagged, not actioned.

---

## What this buys you

| Before | After S1–S5 |
|---|---|
| 8 screen files (2 dead) | 5 screen files |
| ~11 lib/server files in the bus/relay area | ~3 |
| 3 local DB tables | 2 |
| 3 GPS watchers | 1 |
| 6 bottom-nav tabs | 4 |
| 5 Pulse tap types | 4 (or fewer) |

Fewer screens, fewer tables, fewer code paths — a surface small enough to click through every button
on every screen before parade day and trust the result.

---

## Plan (phased — each phase ends green on `typecheck && test && build`)

**Phase 0 — QA P0 first.** Land QA plan **A1** (offline-readiness chip). Skip QA A2 — **S2 supersedes it**.

**Phase 1 — S3 delete dead code.** Pure deletion, lowest risk. Removes the relay cluster + platform
endpoint; fix `shippie.json` capabilities. Verify build still green.

**Phase 2 — S1 one bus.** Collapse `BusMarker` → `bus_seen` `FanEvent`; bump TTL; delete `bus.ts`.
Update `MapScreen`/`PulseScreen`/`CorridorMap`/`CardScreen`/`shippie-db.ts`/`shippie.json`.

**Phase 3 — S2 one GPS source.** Lift `watchGps` to `App`; pass `gpsFix` + a battery toggle down;
remove per-screen watchers.

**Phase 4 — S5 trim Pulse + demote Card.** Cut `crowd_dense` (if approved); Card → Pulse action;
bottom-nav to 4 tabs; default landing to Map (the design's hero).

**Phase 5 — S4 merge Plan + Meet.** Highest effort, do last; one screen, all behavior preserved.

After all phases: re-run the QA plan's five review passes as the release checklist, then the device
matrix (older iPhone Safari + Android, airplane-mode cold start).

---

## Decisions needed from you

1. **S5 — cut `crowd_dense`?** Recommended. `road_blocked` is borderline — keep it (genuine routing
   signal) or cut for an even cleaner Pulse.
2. **S5 — demote Card** from a nav tab to a Pulse action? Recommended.
3. **S4 — merge Plan + Meet?** Recommended, but it is the most work — fine to defer past launch.

Everything else (S1, S2, S3) is unambiguous and should ship.
