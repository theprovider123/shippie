### showcase-ledger
**Stack:** Vite + React 19, local-db, iframe-sdk, design-tokens
**Summary:** Personal + group finance tracking, split-the-bill groups, recurring bills.

**UI polish:**
- **CRITICAL:** Imports `@shippie/showcase-kit` (package.json:23) but `styles.css` has no `.shippie-intent-toast`, `.shippie-qr-sheet`, `.shippie-backup-card`, `.shippie-empty-state` skin. Components that mount these will ship unstyled — paint the skin block per chiwit reference.
- Tab active state uses 2px top border on accent (styles.css:596–599); add subtle bg for phone contrast.
- Consume-prompt dialog (styles.css:617–629) is the only kit consumer styled; finish the rest.

**UX flow:**
- Entry creation seeded from `dined-out` and `shopping-list` intents (App.tsx:141–175) and confirms before save — good friction.
- Group share-link import (App.tsx:274–317) lacks error handling for corrupt blobs; surface a toast.
- Bottom-nav overflow menu hides 2 of 6 actions; add a "more" icon affordance.

**Feature additions:**
- Settlement suggestions on group detail (per-member balance math is in groups-queries).
- Recurring-bill reminders via Notifications API on due date.

**Cleanup / tightening:**
- DraftSeed source enum mixes intent names ('dined-out') with app names ('expense-logged'); unify or extract to constants.

---

### showcase-lift
**Stack:** Vite + React 19, local-runtime-contract, custom iron/chalk/clay/signal theme tokens (NOT design-tokens)
**Summary:** Strength training — templates, session history, progression graphs.

**UI polish:**
- 4 themes via `data-theme` (styles.css:31–65); good. Letter-spacing 0.16em on eyebrow rows is consistent.
- Category pills (styles.css:445–449) lack keyboard focus outline (border-color only).
- Page transitions don't suspend on data load; add subtle loading state.

**UX flow:**
- LiftStateProvider wraps the tree (App.tsx:13) — clean state model.
- Template fork/edit returns to Library (App.tsx:40–44); add unsaved-changes warning.
- Tab union mixes pages + modals ('print', 'template-edit'); split into `mainTab` + `modalState` (App.tsx:36).

**Feature additions:**
- PR celebration card (lift-of-the-month rollup + shareable snapshot of completed session).
- Plate-math overlay (input target weight → suggested plate stack per side).

**Cleanup / tightening:**
- Converge on `@shippie/design-tokens` instead of the bespoke theme map for cross-app consistency.

---

### showcase-live-room
**Stack:** Vite 7 + React 19, proximity, design-tokens, Yjs scaffolding (not yet hooked)
**Summary:** Real-time collaborative spaces, 6-char host code, sunset accent on cream.

**UI polish:**
- **CRITICAL:** If `@shippie/showcase-kit-v2` is imported, the `.shippie-empty-state` skin is missing — paint it.
- Hero centring is clean (styles.css:47–56) but guest-join input lacks confirmation that code was entered.
- No strength meter or masked display for the 6-char requirement.

**UX flow:**
- URL `?code=` prefill (App.tsx:40–45) is smooth.
- Code is uppercased (App.tsx:23) but server-side rejection is silent; show inline feedback.
- No "back to home" breadcrumb after host room created.

**Feature additions:**
- Real-time presence indicators (Yjs awareness state) in the room header.
- Room recording / replay scrubber.

**Cleanup / tightening:**
- View union too loosely typed (App.tsx:8–11); switch to discriminated union with explicit "waiting/connected" states.

---

### showcase-lustre
**Stack:** Vite + React 19, juice (audio/particles), observations
**Summary:** Match-3 cascade — 60 campaign levels + endless + daily.

**UI polish:**
- `.score-float` animations lack easing; add `transition: opacity 200ms ease, transform 200ms ease`.
- Gem cell `border-bottom: 1px solid var(--line)` per row creates visual noise; use a single wrapper border.
- Combo announcer ("Sweet! / Delicious!") timing varies per depth; standardise to 200ms post-match.

**UX flow:**
- Cascade depth announced via combo banner (App.tsx:228–236), good audio + visual cue.
- Share button tries `navigator.share` then clipboard (App.tsx:315–327); URL `shippie.app/run/lustre/` hardcoded — make configurable.
- No undo on miscount on swap; consider a 3s undo window.

**Feature additions:**
- "Stats" page showing campaign progress + personal bests per difficulty.
- Daily challenge leaderboard among paired devices.

**Cleanup / tightening:**
- Cascade progress saved without quota fallback (App.tsx:115); wrap in try/catch.

---

### showcase-maze
**Stack:** Vite + React 19, juice, observations, custom canvas
**Summary:** Pac-Man-style maze with 4 ghost AIs, power pellets, daily seed.

**UI polish:**
- Canvas hardcodes colors (styles.css:266); read from CSS vars for theming.
- D-pad rows lack hover/active states (styles.css `.dpad-row`).
- Optional crosshair on first launch for orientation.

**UX flow:**
- Game state held in `worldRef` (App.tsx:71–72) with `force()` bumps (App.tsx:112) — works but indirect; switch to useReducer.
- Swipe threshold 14px (App.tsx:186) is too low on phones; use `max(8px, 2vw)`.
- No "daily resets in X hours" countdown on home in daily mode.

**Feature additions:**
- Replay token to step through your run frame-by-frame.

**Cleanup / tightening:**
- Date comparison via `toISOString().slice(0,10)` (App.tsx:141) is fragile; extract `iso8601DateOnly()` helper.

---

### showcase-meal-planner
**Stack:** Vite + React 19, design-tokens, transfer API, intent bridge
**Summary:** Weekly meal plan — recipe drag from recipe app, shopping-list derivation, cooked history + leftovers.

**UI polish:**
- Transfer-active banner needs a loading spinner while the recipe drop resolves.
- BudgetOverlay lacks severity tiers (over 5% yellow vs over 30% red).
- Cooked-meal chip lacks visual diff between "this week" vs "leftover from last".

**UX flow:**
- Recipe transfer commit (App.tsx:192–206) auto-fills next empty slot; if the week is full, dismissal banner (line 199) lacks an action button ("Clear a slot").
- Cooked-meal sub (App.tsx:149–167) merges history; dedup key `cookedAt + title` (App.tsx:474) collides on same-day repeats.
- Leftover tracking is partial (LeftoverRow.tsx); full swipeable carousel with "used" action would close the loop.

**Feature additions:**
- Nutrition rollup tab (kcal/protein totals derived from recipes).
- Smart shopping-list dedup using AisleClassifier from showcase-shopping-list.

**Cleanup / tightening:**
- Intent naming inconsistent: `cooked-meal` vs `meal-planned` vs `leftover-available`; namespace under `meal.*`.

---

### showcase-memory-grid
**Stack:** Vite + React 19, observations, design-tokens
**Summary:** Card-flip pair matching — 3 grid sizes (4/6/8 pairs), 4 symbol packs, personal bests per size.

**UI polish:**
- Card flip is instant text-change; add `transform: rotateY()` keyframe.
- Grid is always 4 columns (App.tsx:171); add 2-col rule under 320px.
- Best-time/moves duplicated in header + tab labels (App.tsx:179, 193); consolidate into a "stats" modal.

**UX flow:**
- Lock prevents double-flip; mismatch flips back at 700ms (App.tsx:144–147) — good timing.
- No audio cue on mismatch; observations only on completion (App.tsx:119–124). Add `haptic('error')` on flip-back.
- After a complete game, no "play again" CTA in the header.

**Feature additions:**
- Theme-pack progression — unlock new packs (celestial gradient, neon, etc.) after X games.

**Cleanup / tightening:**
- PersonalBest has redundant `pairs` field (App.tsx:27–31); the map key is enough.

---

### showcase-mevrouw
**Stack:** Vite 7 + React 19, Yjs + y-indexeddb, Tailwind v4 (NOT design-tokens), pairing via QR
**Summary:** Couple PWA — pairing, shared schedule/journal/surprises/gifts/todos/memories; anniversary coral theme.

**UI polish:**
- Anniversary palette toggle (App.tsx:172–180) lacks `prefers-reduced-motion` variant.
- Partner display name may be stale long-offline; add "last seen" timestamp.
- Tab nav style differs from rest of fleet because of Tailwind; document the divergence.

**UX flow:**
- Both devices generate codes independently (App.tsx:54, 91) — resilient but confusing UX; add an intro: "Host creates space, guest scans QR or enters code".
- Import-fragment handler (App.tsx:147–160) lacks share-link expiry policy.
- Presence heartbeat (App.tsx:136) every 5s — but UI never displays partner online/offline state. Add green dot in tab nav or home banner.

**Feature additions:**
- Surprise-timer in tabs (countdown to next anniversary milestone).
- Shared playlist or photo-of-the-day pinned to home.

**Cleanup / tightening:**
- `TOP_LEVEL_ROUTES` (App.tsx:191) is tightly coupled to router and submenu routes; extract submenu set to its own constant.

---

**Mevrouw exclusion note:** Still correct to skip from the 2026-05-19 elevation pass. Tailwind + Yjs presence + couple-PWA scope are intentionally divergent. Flag for inclusion in Phase 6 (Spark phone-to-phone) where presence + real-time are the core work.
