### showcase-co-pilot
**Stack:** Vite + React + Yjs (pair-mesh), @shippie/showcase-kit (no kit components rendered yet)
**Summary:** Co-parent scheduler with mesh pairing — shared schedule, meds, handover notes.

**UI polish:**
- TabNav buttons lack `role="tab"` / `aria-selected` (TabNav.tsx:20–24).
- SyncBar lacks visual distinction during the syncing state; add spinner or hue.
- PairingScreen modal has no loading state during code validation.

**UX flow:**
- Handover unread count limited to the 'handover' route; extend the badge pattern to schedule changes from the partner.
- Add a "sync triggered" toast/icon-pulse confirming manual resync.

**Feature additions:**
- Conflict-resolution UI when both parents edit the same schedule entry.
- "Last synced" timestamp footer.
- Offline-queue indicator when relay is down.

**Cleanup / tightening:**
- `onLeaveRoom` callback chains a side effect in an inline arrow (App.tsx:43); extract a named handler.
- Three state writes per `handleNavigate` (App.tsx:76–79) cross the SDK boundary on every nav; rethink.

---

### showcase-coffee
**Stack:** Vite + React + @shippie/iframe-sdk for intents + haptics
**Summary:** Brew calculator with bean library, tasting notes, history; emits `coffee-brewed`, `caffeine-logged`.

**UI polish:**
- RatioDial drag lacks haptic feedback; add `shippie.feel.texture()` on ratio change (Brew.tsx).
- Bean save has no visible confirmation toast.
- Brew history timestamps are absolute; switch to relative ("2h ago").

**UX flow:**
- ratedLastBrew modal can be dismissed by tab navigation, losing the unsaved rating; auto-save draft or block nav.
- Default-selected bean (App.tsx:41) lacks a "Your usual" label so the default isn't obvious.
- After save, stay on Brew tab — switch to History so users see the new entry.

**Feature additions:**
- Brew comparison view (side-by-side, same method/bean) for consistency tracking.
- Preset templates for popular methods.
- `observations.emit` on taste ratings so other apps can react.

**Cleanup / tightening:**
- `save({...})` fires on every render dep change (App.tsx:58); debounce 300ms to reduce localStorage thrash.
- `selectedBeanId` setter prop passed to BeansPage is never called; drop.

---

### showcase-colour-of-day
**Stack:** Vite + React + observations client
**Summary:** One-tap colour-of-day mood tracker with 30-day ribbon and warm/cool sentiment.

**UI polish:**
- Ribbon tiles lack a `:focus-visible` ring.
- "Picked for today" copy (App.tsx:128) renders unconditionally; gate on `todayEntry`.
- Swatch hex codes aren't copyable; add click-to-copy with toast.

**UX flow:**
- "Last 30 days" label is static; show actual day count present.
- Empty tiles need a hover tooltip ("skipped") via `title` / `aria-label`.
- Sentiment readout shows numeric -1/0/1 (App.tsx:161–169); use descriptive copy ("cooling/balancing/warming").

**Feature additions:**
- Colour-to-mood correlation view.
- Privacy-blur on shared ribbon screenshots.
- SVG export of the ribbon.

**Cleanup / tightening:**
- Ribbon recalculates on every `entries` change (App.tsx:105–117); memoise.
- localStorage catch (App.tsx:70) silently swallows non-quota errors; log them.
- Redundant ternary on lines 120–121.

---

### showcase-cooking
**Stack:** Vite + React + @shippie/iframe-sdk for `cooking-now` / `cooked-meal` intents
**Summary:** Method calculator — sous vide / smoking / roasting / grilling / pan; internal temps, timing, rest.

**UI polish:**
- Active-cook timer is cramped (App.tsx:238–242); enlarge the remaining-time readout.
- DoneRatingForm inline overlay (App.tsx:207–213) lacks backdrop + centred card.
- "Active" count chip (App.tsx:200–201) needs `aria-live="polite"`.

**UX flow:**
- "Finished cook" tap is irreversible; add 5s undo button.
- Active list shows only names — include cut + method + elapsed.
- Home → Method transition doesn't prefill cut/method; carry state forward.

**Feature additions:**
- Preset timers for common cuts (steak doneness ladders, chicken, pork).
- Side-by-side timer comparison.
- `observations.emit` to track which methods get the best ratings.

**Cleanup / tightening:**
- `if (!c.methods.includes(method)) setMethod(c.methods[0]!)` is a render-time setter side effect (App.tsx:76); move into a `useEffect` keyed on `cutId`.
- DoneRatingForm builds the intent inside the callback (lines 132–150); pass `intent_payload` as prop.
- Unused `TYPE` import in `data.ts`.

---

### showcase-crewtrip
**Stack:** Vite + React 19, Yjs/relay, OPFS media, QR share, @shippie/showcase-kit
**Summary:** Live trip hub — itinerary, polls, games/tournaments, memories, chat, playlists, wrap-up awards, mesh-synced host + crew.

**UI polish:**
- **App.tsx is 3418 lines** — split into feature modules with a shared state provider.
- Header inbox count (App.tsx:583–586) runs three list filters; consolidate into one `useMemo`.
- Tournament system notices appended in render (App.tsx:248–291) — move to an effect listening to `tournamentEvents`.

**UX flow:**
- Tab stack history (App.tsx:394–405) has no depth cap; cap at 10 with warning.
- OPFS quota errors swallowed (App.tsx:1099–1100); add error boundary around media writes.
- Crew onboarding multi-screen flow lacks a progress indicator or skip-to-play.

**Feature additions:**
- Host-side activity replay timeline ("show all crew actions in last 2h").
- Auto-generated trip recap (top photos, games won, challenges completed) at wrap.
- Optional trip budget tracker (meals, activities) shared with crew.

**Cleanup / tightening:**
- `usePersistentState` hook (App.tsx:382–391) duplicates a pattern in other apps; promote to `@shippie/sdk`.
- `defaultGroupEmojiInline` defined at file-end (line 3412–3417); move to `utils/emojis.ts`.
- `draftCrewTeam` (App.tsx:411) reads `groups[1]?.id` without an empty-groups guard.

---

### showcase-crossing
**Stack:** Vite + React + @shippie/juice (SFX + confetti) + observations
**Summary:** Frog-crossing arcade — endless/campaign/daily, 3 worlds, character unlocks, pickups, shields.

**UI polish:**
- Fullscreen icon `⛶` (App.tsx:696) is opaque; use a clear SVG.
- Character picker (App.tsx:823–844) lacks a "Unlock at X pts" progress bar on locked tiles.
- Reaction stage colour flips abruptly (App.tsx:391); add CSS transition.

**UX flow:**
- Mode tabs only appear after first run (App.tsx:672); show them always with disabled state + threshold copy.
- Daily streak chip disappears on missed day (App.tsx:712); replace with "streak broken" or "start new streak" copy.
- Add an unlock-hint toast at ~100 pts ("Collect 200 pts to unlock Cat").

**Feature additions:**
- Daily and per-character leaderboards.
- Milestone-unlocked modifiers (slow-mo, etc.).
- Cross-mode challenges tied to observations.

**Cleanup / tightening:**
- `useReducedMotion()` (App.tsx:216) plus duplicate logic at lines 854–865; export once from `@shippie/juice`.
- `force(n => n + 1)` tick hack (App.tsx:203, used at line 568); replace with useReducer or RAF-driven render.
- `confettiTrigger` (App.tsx:193) is set but visuals don't reflect magnitude.
- Eagle magic numbers (EAGLE_WARN_MS, EAGLE_SWOOP_MS) — hoist to named constants.

---

### showcase-cycle
**Stack:** Vite + React + @shippie/local-db + optional Yjs mesh for partner sync
**Summary:** Menstrual + fertility tracker, local-first, optional partner view; emits `cycle-logged`, `cycle-window-predicted`.

**UI polish:**
- Mood-correlation hint (App.tsx:145–150) auto-fades at 8s with no close button or countdown; extend to 12s + explicit close.
- Prediction confidence (App.tsx:113–118) is numeric only; show High/Medium/Low.
- History view lacks visual distinction between flow days and symptom-only days.

**UX flow:**
- Partner mesh init (App.tsx:160–201) fails silently on prefs load error; surface a toast.
- Sharing toggle doesn't explain what's visible to partner; add an info panel.
- Empty state for zero-cycles is bare; add a "log 3+ cycles for predictions" carousel.

**Feature additions:**
- Symptom-vs-cycle-day heatmap.
- iCal export.
- Period prediction Notifications API reminders.

**Cleanup / tightening:**
- `partnerRef.current?.publish(projection)` called twice during initial bind (App.tsx:189 vs 207–208); consolidate.
- Async IIFE in effect with `cancelled` flag (App.tsx:161); use `AbortController`.
- `lastPredictedRef.current` (App.tsx:70) is effectively a `useMemo` signature; switch.

---

### showcase-daily-puzzle
**Stack:** Vite + React + observations
**Summary:** One puzzle-per-day hub — number trail, sudoku, memory grid, reaction; separate legacy storage per mode.

**UI polish:**
- Mode buttons (App.tsx:214–223) show short labels only; add full-name tooltips.
- TrailMode timer updates every 100ms causing jitter (App.tsx:258); update at 200ms, round to 0.1s.
- Reaction-stage transitions are abrupt (App.tsx:391); add CSS transition.

**UX flow:**
- Longest-combined-streak (App.tsx:210) is hidden; promote to a header card with streak animation.
- Trail share button (App.tsx:318) has small toast; enlarge or use confirm dialog.
- Mode switching from TrailMode → Memory clears board with no confirm.

**Feature additions:**
- All-time + per-mode leaderboard.
- Difficulty selectors per mode.
- Cross-mode unlock challenges.

**Cleanup / tightening:**
- `loadStore()` called twice (App.tsx:166 initial + setter line 167); call once outside setState.
- ReactionMode phase logic (App.tsx:359–387) has 4 conditional branches; extract a reducer.
- Legacy storage keys (LEGACY_TRAIL_KEY, etc.) get flattened ad-hoc (App.tsx:235–236); add a named migration helper.
