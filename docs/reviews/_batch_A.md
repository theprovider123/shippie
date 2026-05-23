### showcase-atlas
**Stack:** Vite + React + Leaflet + Yjs (IndexedDB sync, relay-based mesh)
**Summary:** Offline-first trip companion with OPFS-cached map tiles, pinned stops, photos, notes, optional co-traveller mesh via room codes.

**UI polish:**
- TabNav (TabNav.tsx:21) uses `data-active` but lacks `aria-current="page"`. Add `aria-current={current === t.route ? 'page' : undefined}`.
- `.atlas-app-eyebrow` font size undefined (styles.css:1–91); add explicit 0.7rem to match chiwit's mono eyebrow.
- SyncBar relay state may rely on colour alone for connecting/connected/offline — add text label or icon.

**UX flow:**
- Companions pairing screen needs an explicit "Go Solo" path; currently solo is implicit (App.tsx:40).
- Trip detail page lacks duration/distance summary; add metric card below title (e.g., "4 stops · 240 km").
- Pin modal has no back/cancel affordance; add close button + Escape handler.

**Feature additions:**
- Trip export (GPX/GeoJSON).
- Companion handoff visual (checkmark + "handoff in progress").

**Cleanup / tightening:**
- `ensureSchema` runs every route change in `loadStored` (App.tsx:30–37); hoist to module-level effect.
- Unused `router.ts` import in App.tsx — routes flow through localNavigation, not the router module.

---

### showcase-block-drop
**Stack:** Vite + React + @shippie/juice + @shippie/observations
**Summary:** 8x8 grid puzzle — drop 3 random shapes per round, clear lines and 3x3 squares. Daily + endless.

**UI polish:**
- Toast flavours (styles.css:188–191) use gradients only; add icon/glyph prefix (e.g., "✓ Combo ×3").
- `.ghost-invalid` outline is 2px (styles.css:117–119); bump to 3px on small screens.
- Board grid gap 2px feels cramped at max-width; widen to 3px above 340px.

**UX flow:**
- Mode tabs (Endless/Daily) silently nuke the current game; add a "Switch mode?" confirmation.
- Daily streak display only renders when > 0 (App.tsx:253); show "0 streak" too.
- End-of-game overlay has no breakdown (bricks, combos, etc.); add a mini stats card.

**Feature additions:**
- Pause toggle.
- Leaderboard: top 5 per mode in localStorage.
- Keyboard controls (arrow keys + space).

**Cleanup / tightening:**
- App.tsx:46 checks `typeof localStorage === 'undefined'` on every load; extract `useLocalStorage()`.
- `colourForLevel` (App.tsx:73) palette cycles with no comment; document intent.

---

### showcase-body-metrics
**Stack:** Vite + React + @shippie/design-tokens
**Summary:** Privacy-first body tracking — weight + photos stay on-device; 5 tabs (Today/Photos/Trend/Goal/Settings).

**UI polish:**
- Privacy ribbon uses negative margin trickery (styles.css:133–147); replace with `position: sticky; inset-block-start: 0; width: 100vw; left: calc(-50vw + 50%);`.
- Tab buttons lack active underline; add `.tab.is-active { border-bottom: 2px solid var(--accent); margin-bottom: -1px; }`.
- Form inputs have `border-radius: 0` (styles.css:73–85) — bump to 4px or document the sharp-corner choice.

**UX flow:**
- Logging twice the same day silently overwrites; show "Update today's entry" with prefill.
- Photo gallery has no bulk-delete.
- Wipe-data button skips confirmation; add a modal with entry/photo counts.

**Feature additions:**
- Trend smoothing (EMA or Savitzky–Golay) with configurable window.
- CSV export.
- Dark mode toggle.

**Cleanup / tightening:**
- `body-metrics-logged` intent (App.tsx:73–101) may have no listeners; verify or drop.
- `p_${Date.now()}` photo keys (App.tsx:84) can collide; switch to `${Date.now()}_${Math.random().toString(36).slice(2)}`.

---

### showcase-breath
**Stack:** Vite + React + @shippie/design-tokens (dark theme)
**Summary:** Box / 4-7-8 / Wim Hof breathing timer with visual ring; broadcasts `mindful-session` intent on completion.

**UI polish:**
- Ring transition uses arbitrary cubic-bezier (styles.css:78); document or simplify to `ease-in-out`.
- Phase label italic at 22px (styles.css:91–98) hurts readability below 380px; un-italic on small screens.
- Pattern chips (styles.css:113–135) lack a separator between name and blurb.

**UX flow:**
- Rounds stepper (App.tsx:158–180) doesn't show time-per-round; add "~4 min per round" helper.
- "Begin" button doesn't telegraph auto-logging; rename to "Begin & Log Session".
- Session history caps at 6 (App.tsx:201); add pagination or "View all".

**Feature additions:**
- Haptic on phase change (currently only completion).
- Optional bell/chime on phase transitions.
- Custom user-defined patterns.

**Cleanup / tightening:**
- `load()` (App.tsx:14) doesn't validate localStorage schema; wrap in try/catch with defaults.
- Phase math in patterns.ts uses modulo arithmetic; add a unit test or JSDoc.

---

### showcase-bricks
**Stack:** Vite + React + @shippie/juice + @shippie/observations
**Summary:** Breakout brick smasher — 20 levels + endless, power-ups, canvas rendering.

**UI polish:**
- `.hint` text (styles.css:90–100) can hide behind mobile chrome; move into the header.
- Game-over overlay (styles.css:102–118) `min-width: 260px` breaks under 320px; add narrow-screen rule.
- No focus ring on canvas — required if keyboard controls land.

**UX flow:**
- Mode selector lacks descriptions; explain Classic/Daily/Endless inline.
- Ball physics reset on mode switch without warning; require confirmation.
- No visual paddle-bounds guide for first 2s.

**Feature additions:**
- Power-up labels (+shield/+slow/+double) on drop.
- Co-op mode skeleton (per bulwark architecture comment).
- Undo last 5 moves (Classic only).

**Cleanup / tightening:**
- `force` state (App.tsx:73–74) is a re-render hack; switch to `useReducer` or manage loop outside React.
- `image-rendering: pixelated` is non-standard; document why or remove.

---

### showcase-bulwark
**Stack:** Vite + React + @shippie/juice + @shippie/observations + fullscreen API
**Summary:** Tower defence — 6 tower types, 18-node upgrade tree, 20 waves, solo + co-op (lockstep wired, relay TBD).

**UI polish:**
- Tower-chip active bg too subtle (styles.css:83); bump opacity from .08 to .15.
- Selected-cell outline (styles.css:138–142) hard to see on grass; add `filter: brightness(1.1)`.
- `max-height: 60vh` on grid (styles.css:117) creates tiny boards on ultrawide; raise to 75vh.

**UX flow:**
- Ability cooldowns (carpet/freeze/reinforce) referenced in SPECIAL_COOLDOWNS (App.tsx:37–41) but no UI countdown.
- Fullscreen button doesn't reflect state; switch icon when active.
- End-of-game has no summary (towers built, gold spent, enemies defeated).

**Feature additions:**
- Tower range preview before placement.
- Wave preview (enemy count/types) before "Start Wave".
- Visible speed selector (1x/1.5x/2x).

**Cleanup / tightening:**
- `TUTORIAL_STEPS` defined but never rendered (App.tsx:55); wire `useTutorial()` or mark TODO.
- TOWER_COLOR / ENEMY_COLOR maps duplicate palette; extract a shared `PALETTE`.

---

### showcase-care-log
**Stack:** Vite + React + Yjs + IndexedDB + relay mesh + @shippie/design-tokens
**Summary:** Caregiver log — meds + symptoms tracking with optional co-caregiver mesh.

**UI polish:**
- Stub privacy-ribbon comment in styles.css refers to a non-implemented P3 feature; drop or finish.
- Tab labels truncate under 320px (styles.css:127–141); shrink font or switch to icons.
- Sharp-corner inputs (styles.css:53–66) feel clinical; consider 2px radius.

**UX flow:**
- PairingScreen needs a "can't scan?" manual-entry fallback for low-light scenarios.
- Handover queue (`readUnreadHandoverFor`, App.tsx:87) lacks a badge on the tab nav for unread.
- Sync states (connecting/connected/offline) rely on subtle hue differences; add icon + label.

**Feature additions:**
- Archive old entries (group by month, hide by default).
- Print/PDF export for med + symptom reports.
- Medication-due Notification API reminders.

**Cleanup / tightening:**
- `useYjs` (App.tsx:87) may leak listeners on relay reconnect; verify cleanup.
- Pairing logic split across sync/pairing.ts, sync/care-doc.ts, sync/relay-provider.ts; consolidate into `useCareMesh()`.

---

### showcase-chess
**Stack:** Vite + React + custom rules engine (minimax bot, wasm spike planned)
**Summary:** Chess vs. computer (skill 0–6) and two-player local; PGN export, undo, flip, opening book.

**UI polish:**
- Board width calc (styles.css:106) ignores safe-area insets; add `env(safe-area-inset-left/right)`.
- Piece emoji can pixelate on retina; add `-webkit-text-size-adjust: none` and `image-rendering: crisp-edges`.
- Legal-move dots (styles.css:147–150) low-contrast on light squares; add `box-shadow: 0 0 0 1px rgba(0,0,0,0.2)`.

**UX flow:**
- Skill 0–6 input lacks legend; convert to labelled slider.
- Undo only on vs-computer mode (App.tsx:34) but no explanation; harmonise rule.
- Flip button doesn't show current orientation.

**Feature additions:**
- Make opening-book banner persistent for 10 moves before fading.
- Time controls (blitz/rapid/classic).
- Threefold-repetition + 50-move draw detection.

**Cleanup / tightening:**
- `loadSettings()` JSON.parse (App.tsx:57–65) lacks field validation; add schema check.
- Minimax depth limit + timeout to prevent hangs; document wasm-swap intent.
- Add explicit piece-to-symbol mapping constant instead of inline Unicode.

---

### Cross-app patterns (Batch A)

- None of the 8 import showcase-kit-v2 (no CRITICAL skin bug here).
- Repetitive Fraunces @font-face loads in every CSS — extract to shared base file.
- Palette duplication: sage / coral / gold redefined inline; consolidate via `@shippie/design-tokens` CSS vars.
- Games (block-drop, bricks, bulwark, chess) lack keyboard controls.
- Tab nav lacks `aria-current` / `role="tablist"` across the batch.
- Toast UX: each game ships its own; standardise on a single `.shippie-toast` primitive.
