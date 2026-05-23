# Round 6 — Group Hub · simplification · design polish

> Status when written: branch clean + committed, **typecheck · 32/32 tests · build all green.**
> CSS bundle 23.88 KB · JS 322.20 KB (101 KB gz). Round 5 + the launch-gates commit landed.

---

## 1. What codex shipped in round 5 (review)

Credit where due. End-to-end:

- ✅ **Two-button import preview** wired with `Watch on map` / `Join group` + the side-ting fallback.
- ✅ **`SharePayload` v2** — `room`, `roleHint`, `ensurePlanRoom()`. Backwards-compatible.
- ✅ **Side tings end-to-end** — `addSideTing` from the import sheet; `SideTingsCard` on the Group screen; `sideTingsRefresh` plumbed; `primary`/`fallback` persisted on the side ting for map overlays.
- ✅ **Layer toggle row** above the map (Bus · Friends · Side tings · Reports · My taps).
- ✅ **CorridorMap renders side tings.**
- ✅ **Online/Offline pill** in the topbar — interactive, surfaces a status toast on tap.
- ✅ **Solo "Share my dot"** flow with relay room generation.
- ✅ **Analytics** plumbed across every important tap.

Solid foundation. The remaining work is **simplification + chat + design polish**.

---

## 2. The core finding — Group screen is dense; needs a "Hub"

Your ask: *"a group should be easily saved, managed and shared in one simple view. with a chat too."*

The current `PlanScreen` has:
- A `screen-heading` block (eyebrow + h1 + paragraph).
- 7 form labels stacked vertically (name, people, primary, primary time, fallback, if-separated, leave plan).
- An `action-row` with Save + Share QR.
- An inline `status` paragraph (already covered by toasts).
- A "Remember" boilerplate panel.
- `SideTingsCard`.

That's a lot to scroll past. It's also confusing — Share lives at the bottom of a long form, members are a comma-separated text input, and there's no chat. **One simple view** means everything important is one glance + one tap away.

---

## 3. The Group Hub — five stacked cards, no sub-tabs

A single scrollable column. The order tells the story: *who we are · where we'll meet · who's with us · what we're saying · who else we're watching.*

```
┌──────────────────────────────────────┐
│ ① Identity & Share                   │  Big italic name · member count · Show invite (always)
├──────────────────────────────────────┤
│ ② Plan (compact)                     │  Primary point + time above the fold · "More" reveals rest
├──────────────────────────────────────┤
│ ③ Members (live)                     │  One row per member · age-stamped · empty-state friendly
├──────────────────────────────────────┤
│ ④ Chat                               │  Preset chips + optional short text + activity feed
├──────────────────────────────────────┤
│ ⑤ Side tings (existing card)         │
└──────────────────────────────────────┘
```

### ① Identity & Share

The card that replaces the current `screen-heading` + scattered share button.

- Group name in italic Fraunces, ~1.5 rem.
- `5 members · plan v3 · saved 12 min ago` in mono.
- **`Show invite`** primary button on the right — always visible, one tap to the QR sheet.
- Solo state: *"Just you"* + **`Share my dot`** button (replaces the separate `ShareMyDotEmptyState`).
- A tiny `…` overflow menu opens: Rename · Leave group · Switch primary (P2).

### ② Plan (progressive disclosure)

The 7-field form is too much above the fold. Show 3 fields by default; tuck the rest behind a single "More" affordance.

**Above the fold:**
- Group name (small input).
- Primary point (select) + primary time (small input).
- **`Save`** button.

**Behind "More":**
- People (comma input).
- Fallback point.
- If separated.
- Leave plan.

The "Remember" panel is deleted — it duplicates the share-sheet copy.

### ③ Members (live roster)

A real roster, not just a comma string. Stub the data shape now so the relay client can fill it later:

- One row per member: initials chip (deterministic colour from name hash) · first name · last-seen ("live" · "3 min" · "lost signal" · faded outline > 15 min).
- Empty/idle state: *"No one's connected yet. They'll appear when they catch signal."*
- A small *"+ Edit names"* affordance that opens the People field (the existing comma input).

Until the relay client lands, the roster reads from `plan.members` + shows everyone as "saved" (no live indicator). The visual scaffolding ships now.

### ④ Chat — the lean inbox

Tied to the same relay room as the group. Three parts inside one card.

**Top — activity feed (newest first):**
- Auto-events: *Sarah joined* · *Plan updated by Tom · 7 min* · *James — Holloway Rd · 2 min*.
- Preset signals: *Tom: "see the bus" · 1 min*.
- Optional short text: *Sarah: "by the clock tower 🟢" · just now*.
- Each row: initials, name, age, delivery glyph (●/✓/⏳/!).

**Bottom — input row:**
- 3 visible preset chips: **on my way** · **at meeting point** · **see the bus**.
- `…` opens the rest: **lost signal** · **hold tight** · **I'm okey**.
- A small **`text`** toggle reveals a single text field (≤ 80 chars). Default **off** (preset-only ships first).

**Schema** (new packet kind on the existing relay):

```ts
type GroupSignalPacket = {
  kind: 'group_signal';
  id: string;
  source_id: string;
  display_name: string;
  preset: 'on_my_way' | 'at_meeting_point' | 'see_bus' | 'lost_signal' | 'hold_tight' | 'im_okay' | null;
  text?: string;
  created_at: string;
  ttl_minutes: 180;
};
```

**Storage:** new `group_event` table in `shippie-db.ts` (pruning + cap like `fan_event`).

### ⑤ Side tings — leave as is

`SideTingsCard` already shipped in round 5. Drop into card 5; no changes needed beyond the visual rhythm of the hub.

---

## 4. UI cleanup carry-overs from round 4 still pending

Spot-checked against the current `styles.css` — these round-4 items did **not** carry into the committed state:

| Element | Today | Should be (round 4) |
|---|---|---|
| `.wordmark-band` | `padding: 7px 20px 9px;` | `padding: 5px 20px 6px;` (≈ 8 px shorter band) |
| `.day-banner` | `padding: 9px 20px; background: var(--red-soft); font-size: 11px;` | `padding: 6px 20px; background: transparent; font-size: 10.5px;` (left-border alone carries the meaning) |
| `inline-status` in `PlanScreen` | `<p className="inline-status">{status}</p>` still rendered | Delete — `showToast` covers it; the screen-host stops lecturing |
| "Remember" panel in `PlanScreen` | Always shown | Delete — same message lives in the QR sheet body copy |
| `.screen-heading` h1 "Plan" on the Group screen | Always shown | Drop entirely — the Identity card (③ above) replaces it |

Also a small naming inconsistency: nav calls it **Group**, the screen file is **PlanScreen**, the screen heading says **Plan**, the CSS class is `.plan-screen`. Rename file + class to `GroupScreen` / `.group-hub` for one term, one place.

---

## 5. Dead code to delete

Not imported by `App.tsx`. Confirmed unreferenced. ~500 lines.

| File | Lines | Reason |
|---|---|---|
| `src/screens/PulseScreen.tsx` | 210 | Folded into MapScreen action row in round 0 cut |
| `src/screens/MeetScreen.tsx` | 135 | Same |
| `src/screens/CardScreen.tsx` | 150 | Wrap-up cut from v1 |

Pure deletion. No callers; bundle unaffected (already tree-shaken), but the source bloat confuses anyone reading the repo + makes the next IA change harder. Cut them.

---

## 6. Design enforcement — pass/fail against `2026-05-22-parade-companion-design.md`

| Principle | Status |
|---|---|
| Tokens (paper / ink / red / sage / gold) | ✅ held |
| Fonts (Fraunces italic display, JetBrains Mono data, General Sans body) | ✅ held |
| Sharp corners — `border-radius: 0` everywhere except true circles | ✅ held |
| Mono-for-data (chips, timestamps, coords) | ✅ held in `StatusStrip` + `SideTingsCard` |
| Red for action, sage for connected, gold for trophy / side ting | ✅ held |
| Wordmark band thickness | ⚠️ 8 px too tall (round-4 trim missing — §4 above) |
| Day-banner restraint | ⚠️ Red-soft background bleeds — should be transparent (§4) |
| No persistent inline-status paragraphs | ⚠️ Still in `PlanScreen` (§4) |
| Quiet, calm copy — no boilerplate panels | ⚠️ "Remember" panel — cut |
| First-impression on first run | ⚠️ No first-run guide yet (round-4 P1); pending |
| Bottom-nav: 3 tabs | ✅ held |
| Topbar: title + Help + status pill | ✅ held |

Net: the design system is in good shape, six small follow-throughs to ship.

---

## 7. Phased build for codex

### P0 (parade-day must-haves)

1. **Group Hub layout** — refactor `PlanScreen` → `GroupScreen` with the five stacked cards in §3. Delete "Remember"; drop the `screen-heading` h1; remove `inline-status` paragraph.
2. **Chat preset signals** — UI + relay packet schema + local `group_event` table. **No text input yet** (preset-only first; text toggle is P1).
3. **Identity & Share card** with always-visible **Show invite** button.
4. **Round-4 CSS trims** — wordmark + day-banner per §4.
5. **Delete dead screens** — PulseScreen, MeetScreen, CardScreen (§5).
6. **Members card scaffolding** — render the rows now from `plan.members`, stub the live state, wire when the relay client lands.

### P1 (try)

7. **Chat short-text input** (≤ 80 chars, toggle-revealed).
8. **Live member roster** once the relay client publishes per-member position packets.
9. **Plan progressive disclosure** ("More" reveals fallback / if-separated / leave plan).
10. **Group overflow menu** — Rename, Leave, Switch primary.

### P2 (post-parade)

11. **Member avatar colour assignment** (deterministic hash → palette slot).
12. **In-chat ghost-presence indicator** ("…" while someone is typing).
13. **Group rename inline** without re-sharing.

---

## 8. Decisions for you (gate the build)

1. **Chat — text input on by default in v1, or preset-only?**
   Preset-only is safer (no moderation needed). Text-on-by-default is more useful but you ship moderation responsibility. Recommend **preset-only** for parade day; flip to text-on in v1.1 with the on-device classifier from round-4 §11b.
2. **Delete the three dead screens?**
   Recommend **yes** — pure cleanup, no callers, ~500 lines gone.
3. **Rename `PlanScreen.tsx` → `GroupScreen.tsx`?**
   Recommend **yes** — one name everywhere; nav, file, class.

---

## 9. Hard rules carrying in

1. **Group Hub is ONE scrollable view.** No sub-tabs. No accordion-only navigation. Just stacked cards.
2. **Show invite is always one tap.** It lives in card ①; the user never has to scroll to find it.
3. **Chat is in the same card as the group, not its own tab.** It's the group's conversation, not a separate app.
4. **Solo is first-class.** "Just you" looks intentional; not a "no plan yet, broken app" state.
5. **Every row in Members and Chat shows age + source.** Live / 3 min / queued / not-seen-yet.
6. **Design system holds.** Paper · Arsenal red for you · sage for your group · gold for side tings · mono for data · sharp corners. No new fonts, no new colours.

---

## 10. What I'd build first if I had two free hours

The single highest-leverage change is **Identity & Share card (§3 ①)** because it makes the share-QR affordance one-tap-from-anywhere, which is the friction point users will hit hardest at the parade. After that, **the chat preset chips** because that's the new user-asked-for capability. The rest is rhythm + cleanup.
