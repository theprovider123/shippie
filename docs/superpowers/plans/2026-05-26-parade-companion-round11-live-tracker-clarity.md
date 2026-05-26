# Round 11 — Live-tracker clarity · Map first · Promote what matters

> **Branch state:** 119/119 tests · CSS 10.40 KB gz · JS 139.93 KB gz · clean tree on `review-implementation-2026-05-23`. Latest parade commits: `98793d5c`, `1e60a4f3` (live groups), `20579e4e` (zoom), `72950c4f` (offline detail layer).
>
> **The brief:** *"feel like a live gps tracker on you and your goals/group/bus. clear map."*
>
> The infrastructure is rich. The friction is **chrome competing with the map** plus a few visual duplicates that dilute the live feel.

---

## 1. What's already there (the live infra is huge)

| Surface | What it gives | Verdict |
|---|---|---|
| **Live GPS pulse** (`.live-gps-pulse`) | Breathing accuracy ring + radiating live ring + `You` label | ✅ alive |
| **Group members canvas layer** (`drawGroupMembers`) via new `lib/group-live.ts` | Encrypted live friend dots over SignalRoom relay; 8 hour TTL | ✅ shipped this week |
| **Goal pulse** (`.map-goal-pulse`) + dashed sage walk-line | Pulses on the target; line from user to goal | ✅ |
| **Route-tap-to-set-goal** (`onRouteTap`) | Tap the route anywhere → it becomes your goal | ✅ great UX |
| **Bus markers** with age fade | Full alpha when fresh, `0.32` at 60 min+, culled at 4 h | ✅ |
| **ParadersChip** overlay | Top-left crowd-energy mirror | ✅ |
| **Offline map detail layer** (`offline-map-details.ts`) | Areas (park / water / stadium) + lines (road / rail / path) + labels — all baked, all offline | ✅ huge upgrade |
| **Map labels scale-inverse** | `transform: scale(1 / scale)` keeps text size constant when zoomed | ✅ |
| **Pinch-to-zoom around focal point** (`lib/map-view.ts`) | Real-map zoom feel, max scale 6× | ✅ |

The infra is *exactly* what "live GPS tracker on you and your goals/group/bus" needs. The problem isn't capability — it's **legibility**.

---

## 2. What's competing with the map

Today MapScreen renders in this order (top to bottom):

```
1. StatusStrip          GPS · Route · Sync          ~44 px
2. map-brief            (dismissible help row)      ~50 px
3. location-strip       YOU/GPS · grid · age        ~50 px
                                                    ── 144 px chrome above the map
4. [CorridorMap]        the actual map              square (≈360 px on phone)
5. map-status           one-line summary            ~25 px
6. GoalPointer          (when target set, ~76 px)
7. tap-feedback         (5-min persistent row)      ~50 px
8. tap-panel            Quick tap + More reports    ~120 px
9. PoiSheet             (modal when POI tapped)
10. timing-chip/panel   (Bus timing)
11. map-tools-toggle    More map tools ▾            ~40 px
12. map-tools-panel     QuickFind + Layers + Compass (when open)
```

### Three duplications

| What | Where it appears | Same info? |
|---|---|---|
| GPS accuracy | StatusStrip cell · location-strip small text | ✓ |
| Route distance | StatusStrip cell · location-strip "Route arrow" button | ✓ |
| Sync status | StatusStrip cell · LiveSyncStrip was here, now folded — only one place ✓ |
| Place name | location-strip strong · map-status line · GoalPointer body | ✓ partial |
| Last-tap confirmation | toast · tap-feedback persistent row | ✓ |

### Two pulse pile-ups

When you tap "I am here" while GPS is fresh:
- `live-gps-pulse` renders at your GPS coords with **"You"** label
- `my-presence-pulse` renders at the same coords with **"Here"** label
- Both pulse independently, both have a label box, both stack

This makes the spot feel busy. The two-label tower fights the live-tracker minimalism.

### One discoverability gap

**Quick-find chips** (Toilet · Water · Station · ATM) are the killer find-a-thing affordance. They're hidden behind `More map tools ▾`. A first-time user looking for a toilet has no idea they exist. The CrowdCompass and LayerToggleRow inside the same disclosure are *secondary* — they can stay hidden. Quick-find should be promoted.

---

## 3. The "clear map" tightening — what to ship

### Phase A — Remove duplication (saves ~100 px above the map)

**A1. Drop the StatusStrip.** The location-strip already shows YOU + grid + accuracy + age. Route distance is in the same strip via the "Route arrow" button. Sync state moves into the location-strip's right side as a compact mono pill — same one-row pattern, no second row.

**A2. Drop the `tap-feedback` row.** The toast already confirms the tap. The persistent-5-min row below the map repeats the same message and occupies real estate that should be the goal arrow or quick-find chips.

**A3. Drop the `GoalPointer` row.** When a goal is active, the map already shows:
- The goal pulse (gold/red animated dot)
- A dashed sage walk-line from YOU to the goal
- A `FIND · <label>` line in `map-status` below the map

Adding a fourth surface (the compass row) for the same goal is overkill. Replace it with a **goal arrow floating top-right of the map** — visible, scale-aware, follows the goal even when scrolled.

**Net result:** the map is dominant immediately on load. Above it: just the location-strip (one row, ~50 px) and the dismissible map-brief on first run.

### Phase B — Promote what matters

**B4. Quick-find chips ALWAYS visible** above the map, between the location-strip and the map-stage. Layer-toggle + CrowdCompass move INTO a smaller "More layers ▾" affordance — secondary, still discoverable, no longer hiding the quick-find.

**B5. De-duplicate the YOU + HERE pulses.** When `gpsFix` is fresh AND the last local `presence` event is within 30 m of `gpsFix`, hide the `my-presence-pulse` — the live GPS pulse already represents "you are here." Show HERE only when:
- GPS is stale (≥ 30 s old) — HERE marks your last *known* tap, the GPS pulse is faded out
- OR last presence tap is > 30 m from current GPS (you walked, your tap is now history)

**B6. Goal arrow on the map.** A small mono chip in the top-right of the map (sibling of `+ / - / ⊙`) that rotates to point at the goal. Removes the GoalPointer row entirely; the arrow follows your finger as you pan/zoom.

### Phase C — Live group feel (defer if Phase B suffices)

**C7. Friend ring on the YOU pulse.** When ≥ 1 group member is within 200 m, draw a thin sage outer ring on the GPS pulse. Tap it → opens a small "near you" sheet listing friends within 200 m with bearing chips.

**C8. Group member dots match the YOU pulse vocabulary.** Currently `drawGroupMembers` is canvas-painted. Promote them to HTML overlays like `.live-gps-pulse` so they pulse subtly too — same animation, sage colour. Makes the map feel like Find My.

---

## 4. Map review — what's right vs polish

### Right (don't change)

- **Three pulses with distinct colours** — red (YOU), sage (FRIENDS), gold (HERE/GOAL). Good vocabulary.
- **Offline detail layer** (`offline-map-details.ts`) — areas + lines + labels baked into the bundle. Major win.
- **Scale-inverse labels** — text stays readable when zoomed.
- **Route-tap-to-set-goal** — discoverable, fast.
- **POI hit zones scale with zoom** — 44 px target at 1×, smaller at 6× (correct — you've already zoomed for precision).
- **Pinch around focal point** (`zoomMapAt`) — real-map feel.
- **POI tap auto-zooms to 2.25×** (`focusLngLat`) — the user gets a tighter view of what they tapped.

### Polish (cheap)

- **`map-status` one-liner** — currently shows `BUS · ...` / `FIND · ...` / `NEAREST · ...` / `OFFLINE MAP · ...`. When goal is set, this is the **only** thing reminding the user a goal exists (after we drop GoalPointer in A3). Make it slightly bolder + gold-toned when goal is active.
- **Goal pulse + HERE pulse both render even when 1 m apart** — see B5.
- **`tap-panel` "More reports ▾"** — the secondary reports (crowd · road · food · help) are listed inside the disclosure as plain buttons. Could match the FAN_EVENT_BADGES vocabulary (icon + label) for visual consistency with the 3 fast taps.
- **`timing-chip`** — after parade departs, shows "Bus timing · 14:20-15:15 ▾". Tap to expand. Good. Could show the *current* time row (e.g. `Bus timing · now-ish · 14:30`) for live feel.
- **Bus markers** — codex's age-based alpha is good. One more bump: a faint sage trail polyline between successive bus_seen taps would make the bus *feel like it's moving*. That's Phase D (defer).

### Watch

- **CorridorMap.tsx is 1400 lines** — every helper function takes `extent` + `scale` + `labels`. Approaching the "split into modules" threshold. Defer until v1.1 — the file is internally coherent.
- **Three pulse overlays in HTML + multiple canvas drawers** — fine but watch for stacking-context issues when the world transform scales > 4×.

---

## 5. Edge cases walked

| Scenario | Expected | Verdict |
|---|---|---|
| Open Map tab cold, no GPS yet | location-strip shows `GPS · Turn on Location`, map renders cleanly, no pulses | ✅ |
| GPS lands at 35 m accuracy | Live pulse `is-wide` modifier — accuracy ring gold-tinted | ✅ |
| GPS lost mid-session (last fix > 30 s old) | Live pulse `is-stale` — opacity 0.62, gold ring instead of red | ✅ |
| Tap "I am here" with fresh GPS | HERE pulse fires at same coords as YOU — **two labels stack** | 🟠 B5 to fix |
| Tap a station POI | Auto-zoom 2.25×, PoiSheet opens with "Walk this way" | ✅ |
| Tap the route polyline | onRouteTap fires, goal pulse appears, walk-line drawn | ✅ |
| Friend goes live (group-live packet arrives) | Friend dot rendered via drawGroupMembers in canvas | ✅ (verify visibility) |
| Pinch to 6× then tap "⊙" recenter | Resets to 1×, offset 0,0 | ✅ |
| Pack switch via `?pack=watford-vicarage` | New extent, new POIs, GPS dot at Watford coords | ✅ |
| Pack-stale > 14 days | Gold `day-banner--warn` row above the map | ✅ |
| Toast queue (3 toasts fire in 2 s) | Last toast shown (single-slot) | 🟠 known, defer |

---

## 6. Bundle / health

| | Pre-R11 | After R11 (projected) |
|---|---|---|
| Tests | 119 | 119+ (add B5 unit test) |
| CSS gz | 10.40 KB | ~9.8 KB (drop StatusStrip + tap-feedback + GoalPointer styles) |
| JS gz | 139.93 KB | ~138 KB (drop StatusStrip.tsx + tap-feedback render) |

Net: small reduction — we're deleting more than adding.

---

## 7. Phased pickup

### Phase A — Remove duplication (this round)
1. Drop StatusStrip from MapScreen render; fold Route arrow + Sync into the location-strip
2. Drop `tap-feedback` row from MapScreen render
3. Drop GoalPointer row from MapScreen render
4. Delete unused styles for the three above

### Phase B — Promote + de-dupe
5. Quick-find chips above the map, always visible
6. HERE pulse hidden when within 30 m of YOU pulse
7. Goal arrow as a corner overlay on the map (replaces GoalPointer)
8. Smaller "More layers ▾" disclosure for LayerToggleRow + CrowdCompass

### Phase C — Live group feel (defer if Phase B suffices)
9. Friend ring on YOU pulse when ≥ 1 group member within 200 m
10. Friends-near sheet
11. Bus trail polyline between successive bus_seen taps

### Phase D — Polish (lowest priority)
12. map-status gold-toned when goal active
13. Current-time row highlight in timing panel
14. tap-panel "More reports" matches badge vocabulary

---

## 8. What I'd ship right now

**Phase A — all three drops.** That alone gives the map ~120 px back at the top of the screen and removes three duplicate status surfaces. It's the single biggest "clear map" win.

**Then B4 (quick-find always visible) + B5 (HERE/YOU de-dupe)** — both atomic, both noticeably improve the live feel.

Total time: ~30 minutes. Bundle goes DOWN. Tests stay green.
