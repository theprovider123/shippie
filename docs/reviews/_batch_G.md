### showcase-stack
**Stack:** Vite + React 19, pure-TS Tetris engine, juice
**Summary:** Desktop-first Tetris — Marathon/Sprint/Ultra; gravity-scaled, fullscreen, theme picker.

**UI polish:**
- Sub-cell fall progress + lock-delay visual feedback (App.tsx:142, 154) — strong polish.
- T-Spin banner + level-flash overlays re-trigger on state change (App.tsx:152, 242–244).
- Three themes (cosmic/forest/clean) baked in; converge with `@shippie/design-tokens`.

**UX flow:**
- Mode selector + per-mode best scores in header (App.tsx:306, 393–423).
- Lock delay gates line-clears + combo tracking cleanly (App.tsx:220, 249–251).
- Add a "soft-drop preview" line for new players to learn drop physics.

**Feature additions:**
- Difficulty selector (easy/normal/hard) tweaking gravity curves + initial drop speed.

**Cleanup / tightening:**
- Consolidate `COLOR` and `RENDER_SHAPES` into one palette object; remove duplicate constants.
- Add `IntentMatchers.ts` for cross-app discoverability.
- localStorage try/catch with empty catch (stack.ts:105) — log quota warnings.

---

### showcase-steep
**Stack:** Vite + React 19, local-db, QR sharing, showcase-kit (CSS skin required), multi-tab nav
**Summary:** Tea-blend notebook — local-first data, herb library, brew timer, inventory, backup + install nudges.

**UI polish:**
- "More" menu uses `flex-direction: column-reverse` so it pops above (styles.css:1121–1124) — clean.
- Brew timer uses `tabular-nums` for digit alignment (styles.css:801–807).
- **CRITICAL CHECK:** `@shippie/showcase-kit` imported but no `.shippie-onboarding/intent-toast/qr-sheet/backup-card/empty-state` skin. Steep currently uses bespoke DisclaimerSheet/SteepDataPanel, so nothing renders broken today — but if onboarding gets adopted, it'll ship unstyled.

**UX flow:**
- Stacked priority banners (install > backup > seed) prevent noise (App.tsx:125–161).
- DisclaimerSheet on startup with footer-link dismiss (App.tsx:211, 260–273).

**Feature additions:**
- Blend rating / favorites — sort by heart count.

**Cleanup / tightening:**
- Extract `goTo` / `back` / `navigate` boilerplate (App.tsx:105–121) into `useRouting()` hook.

---

### showcase-story-studio
**Stack:** Vite + React 19, local-db, local-files, Yjs sync, drawing canvas, audio recorder, QR pairing
**Summary:** Kid-facing drawing + dictation, parent-approval mode, family mesh-sync.

**UI polish:**
- Fraunces on kid greeting + section titles for warmth (styles.css:43–51).
- Marigold (#E8C547) on cream — appropriate kid-warm tone (styles.css:38–39).

**UX flow:**
- Mode switch button pinned to parent-home for asymmetric safety (App.tsx:127–133).
- LocalNavigation crossfade/rise transitions (App.tsx:56–57).

**Feature additions:**
- Story-audio playback scrubber — currently records but no playback UI visible.
- "Parent approval queue" badge on tab nav with pending count.

**Cleanup / tightening:**
- `sameScreen()` equality check (App.tsx:28) called per render; memoise or hoist.
- Verify `local-files` usage in `Reader.tsx` / `ParentHome.tsx`; if unused, drop the dep.

---

### showcase-sudoku
**Stack:** Vite + React 19, pure-TS sudoku engine, observations, no DB
**Summary:** Infinite procedural sudoku — difficulty selector, pencil marks, 30-deep undo, hint system.

**UI polish:**
- Same-value/same-axis highlights via low-opacity overlay (App.tsx:158–159) — subtle, good.
- Pencil grid (3x3) inside cells matches industry standard (App.tsx:178–184).
- Cell tap target is small on tablets; bump to 56px on `min-width: 768px`.

**UX flow:**
- Pencil + undo + hint in one row avoids menu sprawl (App.tsx:190–209).
- Conflicts memoised + rendered red (App.tsx:33–41, 152).
- Add a "save progress" indicator so the user knows mid-puzzle state persists.

**Feature additions:**
- Timer + per-difficulty best-time leaderboard in localStorage.
- Auto-fill "single-candidate" cells as a teaching feature on Easy.

**Cleanup / tightening:**
- `clonePencils()` (App.tsx:254–258) called inline in `place()`; extract const.
- Add `IntentMatchers.ts` for cross-app discoverability.

---

### showcase-symptom-diary
**Stack:** Vite + React 19, local-db, 5-tab nav, intent bridge for mood/sleep
**Summary:** Chronic-illness tracker — symptoms, meds, intensity 1–5, print-to-PDF, mood/sleep consumers.

**UI polish:**
- Intensity ramp `--intensity-1` … `--intensity-5` maps sage → sunset (styles.css:23–28) — nice.
- Print CSS hides nav/controls, black-on-white for filing format.
- Today loading state shows "Opening Symptom Diary…" plain text (App.tsx:233–238); add skeleton.

**UX flow:**
- Soft prompt ("Mood low — log a symptom?") on mood < 4 (App.tsx:124–151).
- Today fast-path: tap symptom row + intensity = saved entry, no form (Today.tsx:38–61).

**Feature additions:**
- Trigger tagging on symptom save — meal/activity/stress with autocomplete from prior entries.

**Cleanup / tightening:**
- `activeMedications` filter (App.tsx:231) re-runs every render; memoise if list grows.

---

### showcase-tab
**Stack:** Vite + React 19, Yjs + y-indexeddb, QR pairing, settlement netting, currency picker
**Summary:** Bill splitter for nearby phones — ephemeral room, per-person ledger, settlement matrix.

**UI polish:**
- SyncBar shows relay state inline (App.tsx:86) — good.
- BalanceBar uses credit (green) / debit (rust) for polarity.
- Add "currency symbol" prefix to all amount inputs to disambiguate decimals/thousands.

**UX flow:**
- PairingScreen front-loads if no room; 3-tab nav locks after pairing (App.tsx:27–37).
- "Leave" button clears pairing and resets (App.tsx:94).

**Feature additions:**
- Expense photo capture — snap receipt, OCR amount + merchant.

**Cleanup / tightening:**
- Manual ROUTES validation (App.tsx:76–80); replace with `satisfies` type assertion to catch routing errors at compile time.
- RelayState subscription (App.tsx:70–74) needs `if (!bound.relay) return;` guard.

---

### showcase-tap-counter
**Stack:** Vite + React 19, localStorage, observations for `counter.tapped`
**Summary:** Single-purpose tap counter — multiple counters, reset, delete.

**UI polish:**
- Full-width tap button with layered hint (App.tsx:181–191).
- Counter tabs render only if > 1 counter (App.tsx:165–178) — clutter-free.
- Add a "running sum" footer when multiple counters exist.

**UX flow:**
- Inline add form (App.tsx:144–163) with autofocus.
- Confirm dialogs on reset + delete (App.tsx:102–103, 112) — prevents accidental loss.

**Feature additions:**
- History timeline — last 10 taps with timestamps per counter.

**Cleanup / tightening:**
- `newId()` crypto check (App.tsx:51–56) duplicates logic in other showcases; extract a shared utility.
- Add `IntentMatchers.ts` for cross-app discoverability.

---

### showcase-therapy-notes
**Stack:** Vite + React 19, local-db, 5-tab nav, intent consumer (mood/sleep), CBT worksheets
**Summary:** Between-session workbook — cream + sage palette, daily check-in, free notes, thought records, session prep, print-friendly.

**UI polish:**
- Bottom tabs use `aria-selected` + `role="tab"` (styles.css:77–98, App.tsx:217–238) — strong a11y.
- Nudge system uses once-per-day heuristic via `NUDGE_KEY + todayKey()` (App.tsx:66–76).

**UX flow:**
- Home → New/Checkin/Week/Prep with `new` / `print` as sub-pages (App.tsx:219–224).
- Checkin saves mood broadcast → triggers once-daily nudge in siblings (App.tsx:176–182).

**Feature additions:**
- Export-as-markdown: home "Tools" → generate `.md` file with week's entries + summaries.

**Cleanup / tightening:**
- Wrap intent-subscribe callbacks (App.tsx:139–152) in `useCallback` to stabilise deps.

---

**Cross-batch patterns:**
- **Kit-skin gap watch:** Steep, Story-Studio, Symptom-Diary, Tab, Therapy-Notes all import showcase-kit-v2 but none paint the `.shippie-*` skin block. They use bespoke components today so nothing's visibly broken — but adopting OnboardingFlow or QrShareSheet in any of them will ship unstyled. Document this assumption explicitly or paint the full skin proactively.
- **Missing IntentMatchers:** Stack, Sudoku, Tap-Counter have none; add for cross-app discoverability.
- **localStorage quota:** Stack, Sudoku, Tap-Counter use empty catch blocks; introduce a shared QuotaManager or at least log on exhaustion.
- **Theme convergence:** Stack ships its own 3-theme picker; converge on `@shippie/design-tokens` variants.
