### showcase-dough
**Stack:** Vite + React 19, localStorage, Notifications API
**Summary:** Baker's percentages, recipe library, active-bake timeline with notifications. Intent flow: `dough-ferment-started`, `dough-ready`.

**UI polish:**
- `.recipe-chip` (styles.css:187–200) lacks hover lift; mirror `.quick-grid button:hover` with `transform: translateY(-1px)`.
- `.bake-card` progress bar (styles.css:262–272) blends into background; darken `--sage-leaf` on the fill.
- Bottom safe-area insets missing on some modals (styles.css:788).

**UX flow:**
- Abandon-bake uses native `confirm()` (App.tsx:184); switch to in-app sheet.
- `closeHome()` (App.tsx:70–73) loses the prior route on multi-step nav; track a back-stack.
- "Enable notifications" CTA (App.tsx:290–298) floats over tabs every visit; turn into dismissible banner.

**Feature additions:**
- Flour-mix template presets (focaccia, bagel, brioche) to speed recipe creation.
- Hierarchical sub-prompt rendering (indent or rule-coloured) to show stage → sub-prompt relation (styles.css:550–567).

**Cleanup / tightening:**
- **App.tsx:22 — `APP_SLUG = 'drawing-telephone'`. Copy-paste bug. Should be `'dough'`.** Priority fix.
- `.dough-code` CSS class (styles.css:852–860) is defined but never applied; remove or wire up.
- Token-overrides scattered across selectors; consolidate into a single `:root` block.

---

### showcase-drawing-telephone
**Stack:** Vite + React + @shippie/proximity + @shippie/qr + Web Speech API
**Summary:** Pictionary-meets-Chinese-Whispers via local mesh.

**UI polish:**
- QR display (App.tsx:259–290) lacks explicit aspect-ratio; add `aspect-ratio: 1; width: 300px; max-width: 100%`.
- Voice button pulse animation (styles.css:274–277) runs forever; limit to 3 cycles.
- `.waiting p` wraps badly on tiny screens (styles.css:163); add `word-break: break-word`.

**UX flow:**
- Join-form validation flickers on each keystroke (App.tsx:56–71); validate on blur or paste.
- Share-note timeout (App.tsx:195–215) doesn't cancel on unmount; wrap in ref + cleanup.
- "Waiting for players" poll (App.tsx:277–279) goes stale on tab-switch; reset on focus.

**Feature additions:**
- Round scoring/streaks across the chain.
- Custom prompt packs in localStorage.
- Visible transcript bubble after speech capture.

**Cleanup / tightening:**
- `WYR_IMPORTED_KEY` + legacy migration (App.tsx:430–442) belongs in a shared utility or should be retired.
- Extract `useSpeechRecognition()` hook from VoiceCaptionButton (App.tsx:461–487).
- Fraunces loads twice (styles.css:286–289); drop unused italic.

---

### showcase-drift
**Stack:** Vite + React + Canvas + @shippie/juice + daily-seed
**Summary:** Vector-style asteroid shooter with classic + synthwave skins.

**UI polish:**
- `.app` padding (styles.css:34–40) ignores `env(safe-area-inset-bottom)` for the fixed controls; add `max(12px, env(...))`.
- Ghost buttons (styles.css:58–66) at 36×36 are too small near scores; raise to 44px min.
- Game-over overlay (styles.css:99–113) needs `pointer-events: none` on canvas while open to halt clicks.

**UX flow:**
- `startGame()` doesn't reset `lastFrameRef` (App.tsx:88–94) — first frame's dt is huge.
- Mode buttons (App.tsx:153–154) can swap modes mid-game without resetting phase.
- Daily streak persists but no "you played today" badge; add one to the menu.

**Feature additions:**
- Particle burst on asteroid destruction in synthwave skin (currently muted).
- Hyperspace cooldown bar coloured to match active skin.
- Weekly best-wave reset + cohort comparison.

**Cleanup / tightening:**
- `setForce(0)` re-render trigger every frame (App.tsx:79) blows React's reconciliation; render once + RAF.
- Dependency array `[phase, world, mode, skin]` (App.tsx:148) lists `world` which never changes; trim.
- Fraunces @font-face declared but never used in canvas ctx (styles.css); drop.

---

### showcase-five-letter
**Stack:** Vite + React + 3-language daily word puzzle
**Summary:** Wordle-clone with hard mode, archive, stats; en/es/fr packs.

**UI polish:**
- Media query (styles.css:47) overlaps the `.key` desktop rule exactly at 480px; change to `max-width: 479px`.
- Tile flip (styles.css:122) missing `backface-visibility: hidden`.
- Win bounce plays on every prior row when winning on guess 1; restrict to solution row.

**UX flow:**
- Hard-mode error fades after 2200ms (App.tsx:130); raise to 3000ms.
- Hard-mode check (App.tsx:237–259) breaks on accented chars (ñ, ç); normalise both sides.
- Archive shows 30 days but no won/lost/unplayed visual distinction (App.tsx:600–614).

**Feature additions:**
- Pre-load all three language banks in parallel (App.tsx:146–152).
- Animation speed toggle (1x/2x).
- Shareable themed grids (custom emoji, puzzle ID).

**Cleanup / tightening:**
- Practice-puzzle filter uses string startsWith (App.tsx:353–355); add `kind: 'daily' | 'practice'` to PersistedAttempt.
- WYR-answer import (App.tsx:409–421) lives in App; move to `share/wyr-import.ts`.
- `.kb-row` centred on wide screens; left-align under 480px.

---

### showcase-habit-tracker
**Stack:** Vite + React, intent subscriber for auto-checks, local agent insights
**Summary:** Habit tracker with cross-app auto-check on signals, weekly review, archive.

**UI polish:**
- Streak block (styles.css:309–315) uses static 28px font; clamp it: `clamp(20px, 6vw, 28px)`.
- Form input height 40px (styles.css:403–406) is cramped on touch; raise to 48px.
- Heatmap legend (styles.css:369–379) clips on phones; place it above the heatmap on mobile.

**UX flow:**
- Auto-check via intent doesn't refresh HabitDetail (App.tsx:154); add refresh hook.
- Duplicate cue prompts when same intent fires twice (App.tsx:152–182); collapse into a single prompt with count.
- Weekly review (App.tsx:216–227) depends on local time; switch to ISO week + UTC anchor.

**Feature additions:**
- Difficulty breakdown in weekly review (easy vs hard return-rate).
- Habit collections/tags for filtering.
- Day-of-week distribution chart.

**Cleanup / tightening:**
- Fraunces italic + 500-weight loads unused (styles.css:482–558).
- `SUGGESTION_INTENT_LABELS` (App.tsx:35–47) duplicates labels across apps; move to a shared module.
- Null-check `activeHabit` (App.tsx:341); nav back to list if missing.

---

### showcase-hearth
**Stack:** Vite + React + Yjs + y-indexeddb + relay mesh
**Summary:** Family chore board + fridge notes + dinner plan over local mesh.

**UI polish:**
- `--bg: #F5EFE4` (styles.css:46) clips warm on some monitors; switch to `#F4F0E8`.
- 5-tab nav wraps labels under 320px (styles.css:157–169); icon-only on small screens.
- SyncBar needs `aria-live="polite"` so SR users hear state changes.

**UX flow:**
- `BoundHearthDoc` created once and never rebound (App.tsx:44–54); destroy/rebuild on pairing change.
- Routes (handleNavigate, App.tsx:68–71) don't 404 if linked data was deleted; add error boundary.
- Pairing flow lacks "member joined" toast on the host side.

**Feature additions:**
- Cooked/Liked tagging on dinner suggestions (styles.css:480–504) to personalise.
- Round-robin chore rotation mode.
- Last-updated stamp + "archive old" for fridge notes.

**Cleanup / tightening:**
- Tokens imported then overridden (styles.css:10 + 46–63); consolidate the `:root` block.
- Back-button inconsistency across pages; standardise header pattern.
- Extract pairing logic into `useHousehold()` hook for testability.

---

### showcase-invaders
**Stack:** Vite + React + Canvas + @shippie/juice
**Summary:** Space Invaders variant — 11×5 grid, 4 ship types, boss every 5 waves, classic + synthwave skin.

**UI polish:**
- Padding rules conflict on small screens (styles.css:34–40 vs 165–167); unify to a single safe-area rule.
- Hidden touch row (styles.css:92–111) still in DOM; switch to `display: none`.
- Ship tiles lack hover/active feedback (styles.css:133–146); add `background: rgba(255,255,255,0.08)`.

**UX flow:**
- `prevAlive` not reset between games (App.tsx:118); spurious particle bursts on game 2.
- Continuous-fire `lastFireRef` persists across pauses (App.tsx:132–138); store pause timestamp.
- Ship-selection card (App.tsx:309–337) hides stats; add fire-rate/damage bars.

**Feature additions:**
- Larger letter labels on power-ups for mobile (App.tsx:426–437).
- "BOSS INCOMING" banner + timer on wave 5/10/15.
- Wave-clear observations + boss-defeat achievements.

**Cleanup / tightening:**
- `e.preventDefault()` missing on space (App.tsx:212–214); page scrolls during play.
- Shield ternary is a no-op (App.tsx:440); simplify.
- Safe-area fallback duplicated in CSS + JSX (styles.css:162–168); collapse.

---

### showcase-journal
**Stack:** Vite + React + @shippie/local-db (SQLCipher) + local AI worker
**Summary:** Personal journal with sentiment, trends, year-in-review; quick & full editor modes.

**UI polish:**
- `color-mix()` patina (styles.css:68–78) has &lt;85% support; add a solid fallback above the `color-mix` rule.
- `.body-input` (styles.css:163–182) corner radius 0 + `resize: vertical` shows a jagged handle; add 2px radius.
- Entry-card-share button (styles.css:262–264) at 28×28 is too small on mobile; raise to 44px or move to header.

**UX flow:**
- Encryption-unavailable banner (App.tsx:97–101) never auto-dismisses; listen for runtime availability.
- Import-fragment detection (App.tsx:75–88) runs only on mount; add `hashchange` listener.
- Sentiment sparkline silently hides if AI unavailable (App.tsx:65–67); show tooltip.

**Feature additions:**
- Backdating: time picker for entries.
- Query builder with date + sentiment + topic filters.
- "Share year-in-review" with a public read-only link.

**Cleanup / tightening:**
- Drop unused Fraunces italic + 500 loads (styles.css:1–35).
- Surface migration errors (App.tsx:52–54): silent catch hides incomplete migrations.
- Dynamic-import the heavy SDK init helpers to slim main bundle (App.tsx:14–16).
