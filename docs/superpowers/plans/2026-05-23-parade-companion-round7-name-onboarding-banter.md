# Round 7 — Display name · 2-slide onboarding · Banter tab

> Branch status at write: **typecheck clean · 37/37 tests · build OK · `f54e1c09 feat(showcase): tighten parade group hub launch`** is the latest parade commit.
> Group Hub (Identity · Plan · Members · Chat · Side tings) is shipped and clean. This round adds three things: a personal name, a first-run guide, and a Banter tab for joy.

> Codex amendment: keep Round 7 one-time-use and offline-first. Banter ships as **cue cards, local votes, and local cheer taps**. No full lyrics, no public wall, no relay dependency for v1. Future relay sync can read the same local records, but the parade-day UI must remain useful in airplane mode.

---

## 1. Quick state review (what's working)

| Surface | Status |
|---|---|
| 3-tab nav (Map · Group · Safety) | ✅ stable |
| Group Hub — 5 cards in one scroll | ✅ shipped round 6 |
| Chat preset signals (preset-only v1) | ✅ wired, local storage, analytics tracked |
| Side tings end-to-end (Watch / Join) | ✅ shipped round 5 |
| QR fix (Layer A + B) | ✅ both layers shipped |
| Battery glyph + status strip + toast + haptic alphabet | ✅ all wired |
| Wordmark / day-banner trims (round 4 carry-overs) | ✅ applied round 6 |
| Dead-code cull (Pulse/Meet/Card/Plan screens) | ✅ done round 6 |
| Tests | 37/37 |

**One small piece of dead code spotted:** `src/components/ShareMyDotEmptyState.tsx` (24 lines) is no longer imported anywhere — `GroupIdentityCard`'s `solo` mode replaced it. Safe to delete.

---

## 2. Simplification opportunities — small wins

These are cheap, no decisions needed.

| What | Today | Improvement |
|---|---|---|
| `ShareMyDotEmptyState.tsx` | unreferenced | **Delete.** |
| `Side tings` empty-state copy | "Watch another crew on your map. Scan their QR or paste their code to add them." | Shorter: "Add a friend's QR to watch their crew here." |
| `Bus timing estimate` panel on Map | Always expanded | Collapse to a chip after the parade has departed (`now > startTime + 30 min`). |
| `Help` button in topbar | Only links to Safety | Overflow `…` menu: **Edit name · Help · About** — opens a small sheet. (Saves a nav slot for Banter.) |
| `day-banner` | Always shown when `isParadeDay()` | Already gated — good, but consider a small **"Parade is tomorrow"** banner the day before for setup nudge. |

---

## 3. Display name — "your name on this phone"

**The gap:** today the user's display name in chat signals comes from `plan?.members[0]` (the first listed member name) or "Me" — neither is a personal identity. When relay messages start flowing, every signal should carry **your** name, not the group's first member's name.

### The shape

A tiny, dependency-free module:

```ts
// src/lib/display-name.ts
const KEY = 'parade-companion:display-name';
export function getDisplayName(): string {
  if (typeof localStorage === 'undefined') return 'Me';
  return localStorage.getItem(KEY) || 'Me';
}
export function setDisplayName(value: string): void {
  if (typeof localStorage === 'undefined') return;
  const clean = value.trim().slice(0, 24);
  if (!clean) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, clean);
}
export function hasDisplayName(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return Boolean(localStorage.getItem(KEY)?.trim());
}
```

### Wire-up

- `GroupScreen.onSignal()` reads `getDisplayName()` instead of `plan?.members[0]`.
- Future relay packets (positions, polls, cheers) all carry `display_name: getDisplayName()`.
- Editable via the topbar overflow menu **and** the onboarding (§4).

### Where it lives in the UI

- Set once in the onboarding (§4).
- Editable later: tap the `…` next to the Help button in the topbar → **Edit name** sheet (paper card, single input, Save + Cancel).
- Never displayed publicly — local + relay only.

---

## 4. Two-slide onboarding (first run)

**The gap:** new users get the Map screen with zero orientation. The wordmark + readiness chip do work, but a 10-second guided intro turns "what is this?" into "got it."

### The flow

Triggered on first launch when `!localStorage.getItem('parade-companion:onboarded')`. A full-screen overlay on top of the app shell. Two slides, swipe / tap to advance. Skippable from slide 1.

```
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│ Slide 1 / 2 — Welcome                │    │ Slide 2 / 2 — How it works           │
│                                      │    │                                      │
│  italic Fraunces:                    │    │  Three lines, mono labels:           │
│  "Hey, what should we call you?"     │    │                                      │
│                                      │    │  ① Save the map offline.             │
│  [ name input ]                      │    │     Already done — keep the tab.     │
│                                      │    │                                      │
│  [ Skip ]    [ Continue ]            │    │  ② Make a group plan.                │
│                                      │    │     Share QR. Friends join or watch. │
│                                      │    │                                      │
│                                      │    │  ③ Tap the map.                      │
│                                      │    │     "I'm here", "Bus is here", or    │
│                                      │    │     "Report" if something's off.     │
│                                      │    │                                      │
│                                      │    │  [ Get started ]                     │
└──────────────────────────────────────┘    └──────────────────────────────────────┘
```

### Implementation

- New `components/Onboarding.tsx` — overlay (z-index above ToastHost), one-component flow.
- New `lib/onboarding.ts` — flag set + check helpers (mirrors `display-name.ts`).
- App.tsx renders `<Onboarding ... />` conditionally on first run; dismiss sets the flag + saves the name.
- Skip on slide 1 = sets the flag without a name (defaults to "Me"; user can edit later).

### Design language

- Paper background, sharp corners, italic Fraunces for the heading, JetBrains Mono for the step labels, single big primary action button.
- A subtle 1/2 indicator in the top-right (mono, ink-mute).
- Slide transitions: simple CSS slide; respects `prefers-reduced-motion`.

---

## 5. Banter tab — chants, polls, cheer

### Mental model

Banter ≠ coordination (Chat in Group). Banter = pure fan-fun.

- **Chat** (in Group) = *"where are you?", "see the bus", "I'm okay"* — logistics.
- **Banter** (new tab) = *chants, polls, cheers* — joy.

Different verb, different cadence, different room (literally — Banter content lives in its own local store, optionally shared via the same relay).

### Nav shift — 3 tabs → 4

```
[ Map ]  [ Group ]  [ Banter ]  [ Safety ]
```

Still tight. The sequence reads: **utility · coordination · fun · safety net.** Banter goes between Group and Safety because that's the user's emotional journey on the day — coordinate, celebrate, fall back to safety only when needed.

### Three cards in the Banter screen

#### ① Chant cues

A scrollable cue-book. **Static** content baked into the route pack. Offline-first. Do **not** ship full copyrighted lyrics; ship titles, short prompts, and "phones away" nudges.

Data model:

```ts
interface Chant {
  id: string;
  title: string;
  cue: string;
  detail: string;
}
```

5–10 chant cues for v1. Each renders as one sharp paper row; tap the title to expand the detail. Title in General Sans bold, cue in mono red, detail in small ink-dim copy. The point is a 2-second prompt, not a song-book.

A **search/filter** bar is overkill at 10 items — skip it. A 1-tap "Random chant" button might be fun, but defer.

#### ② Polls

2–3 local-first polls per parade. Pre-defined questions + options baked into the route pack. Group relay can merge later, but v1 must work fully in airplane mode.

Defaults for parade day:
- **"Player of the season?"** — Saka · Odegaard · Saliba · Rice · Other.
- **"Best moment this season?"** — curated list only.
- **"After the parade?"** — Pub · Park · Food · Home · Still deciding.

Data model:

```ts
interface Poll {
  id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  allowFreeText?: boolean;
}
```

Voting model — local v1, relay-ready later:

```ts
type PollVotePacket = {
  kind: 'poll_vote';
  pollId: string;
  optionId: string;          // or 'free' if free-text
  freeText?: string;
  source_id: string;
  created_at: string;
  ttl_minutes: 720;          // 12 hours — long enough to outlast the day
};
```

Storage: new local banter module with one vote per poll per phone. Relay packets remain P1.

UI: each poll renders as a card — question in italic Fraunces, options as chips (paper, sharp, 1px line). Tap an option to vote. Below: a small horizontal stacked bar showing percentages (paper-2 fill, sage for leading option). Vote count shown in mono.

#### ③ Cheer

Celebratory taps — pure expression, no message.

5–6 tiles in a grid: **Champions** · **COYG** · **North London** · **Mikel** · **Reds** · **One more song**.

Each tap:
- Increments a local counter.
- Strong haptic (`hapticWow` from the round-4 alphabet — the bus-tap pattern, repurposed for joy).
- Brief flash of the tile (200 ms scale + paper-tone pulse).
- (Optional, P1) emits a `cheer` packet to the relay; group's cheers aggregate into a single counter per cheer-id.

The counter display: a big mono number on each tile (your own total). When the relay aggregates, switch to a stacked display: `[your count] · [group total]`.

### Banter screen layout

```
section.banter-hub (gap 14px stacked cards)
  ① Chant cues       (panel)
  ② Polls            (panel)
  ③ Cheer            (panel — tile grid inside)
```

Same `.panel` base + new class modifiers per card.

---

## 6. The "what gets cached when" question

Banter content needs to be available **offline**. Three layers of content delivery:

| Content | Where it lives | Offline? |
|---|---|---|
| Chant cues | `pack.banter.chants[]` in `route-pack.json` (already in `runtime_assets`) | ✅ Yes — comes down with the route pack |
| Poll definitions | `pack.banter.polls[]` similarly baked | ✅ Yes |
| Poll votes | Local `poll_vote` store + relay sync when up | ✅ Local-first |
| Cheer counters | Local `cheer_count` store + relay sync (P1) | ✅ Local-first |

Route pack stays a single JSON; the additional sections add maybe **5–8 KB** total after gzip. Cheap.

---

## 7. Codex pickup list

### P0 — must ship for parade

1. **`lib/display-name.ts`** + wire into `GroupScreen.onSignal`.
2. **`components/Onboarding.tsx`** with two slides, `lib/onboarding.ts` flag, App.tsx conditional mount.
3. **Topbar overflow menu** with **Edit name** sheet (small modal; reuses the toast / panel styles).
4. **Delete `components/ShareMyDotEmptyState.tsx`** (dead code).
5. **Banter tab — minimum viable:**
   - 4th nav entry `'banter'` in App.tsx + new `screens/BanterScreen.tsx`.
   - Chants card with static cue content from `pack.banter.chants[]` (extend `parade-2026.ts` types + `route-pack.json` data).
   - Cheer card with **local** counters (6 tiles, haptic, counter). No relay broadcast yet.
   - Polls card with **local** votes. Relay merge remains P1.
6. **Side tings empty copy** tightened (one-liner change).

### P1 — try to land

7. **Cheer relay broadcast** — same packet plumbing as chat signals.
9. **Bus timing collapse-to-chip** post-departure on the Map screen.
10. **"Parade is tomorrow" banner** the day before (Setup nudge).

### P2 — post-launch

11. Group cheer aggregation (big counter showing the whole group's cheers in real time).
12. A "random chant" CTA on the Chants card.
13. Crowd noise capture (post-parade, opt-in, with privacy controls).
14. Cheer animation polish — confetti, ripples, etc.

---

## 8. Decisions for you (gate the build)

1. **Banter as a 4th nav tab — confirm?** Alternative is folding into Group Hub as a card; recommend keeping it separate so Group stays focused on coordination and Banter stays focused on joy.
2. **Onboarding skippable from slide 1?** Recommend yes — the name is fixable later. Pressing through resistance on slide 1 doesn't help adoption.
3. **Cheer broadcast to group in v1 (P0) or local-only (defer to P1)?** Recommend **local-only in v1** — relay bandwidth is precious; cheers are the easiest to make optional. Group aggregation lands v1.1.
4. **Polls in v1 or v1.1?** Ship local-first in v1; relay aggregation stays v1.1.

---

## 9. Hard rules carrying in

1. **Banter never blocks the offline core.** Polls + cheers degrade to local-only when relay is down. Chants are static.
2. **Display name is local-only.** Never tied to an account. Relay packets carry it as a string but no server stores it.
3. **Onboarding never re-shows.** One single-use localStorage flag, no "show again" hooks.
4. **Cheers are pure joy.** Don't bolt safety semantics onto them — they're not signals.
5. **The design language holds.** Paper · Arsenal red · sage · gold · italic Fraunces for headings · mono for data · sharp corners. The Banter tab uses the same vocabulary.
6. **4 tabs is the ceiling.** If we ever want a 5th surface, it folds into an existing tab. The IA breathes in four.

---

## 10. What I'd build first if I had two hours

The single highest-leverage thing is **display name + onboarding** because it removes the awkward "Me" default that's currently bleeding into every chat signal. After that, **Banter Chants** because it's pure static content — zero relay risk, instant delight, ~30 lines of code on top of the route-pack data. Polls and cheer-broadcast can land in the relay-client sprint.
