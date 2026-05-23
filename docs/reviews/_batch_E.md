### showcase-move

**Stack:** Vite + React 19.2.5, Fraunces/Inter typography, warm cream/green palette
**Summary:** Pace tracker logging workouts, plans, and sleep with cross-app caffeine context. Minimal local-only UI. Broadcasts 3 intent types.
**UI polish:**
- Intent listener for caffeine-logged at App.tsx:45-50 surfaces cross-app context in header without blocking layout
- Summary cards use consistent 4-col grid with accent color hierarchy (App.tsx:107-112)

**UX flow:**
- Mode toggle resets editor state smoothly via createLocalNavigation crossfade (App.tsx:119-129)
- Missing: "no entries" empty state messaging beyond footer hint (App.tsx:168)

**Feature additions:**
- Caffeine context loop could bubble up to move summary ("caffeine may reduce sleep quality" inline hint)

**Cleanup / tightening:**
- App.tsx:339: unused `deletePitch` ref in onBack handler (move should call it or remove)

---

### showcase-pantry-scanner

**Stack:** Vite + React 19.2.5, sage-leaf accent, barcode + camera, on-device vision via PhotoClassify component
**Summary:** Inventory tracker with bulk add from shopping list intent, expiry warnings, recipe suggestion sidecar. 5-tab nav. Heavy component tree.
**UI polish:**
- Restock card dialog uses aria-label + role=dialog, dismisses cleanly with 5s auto-clear on accept (App.tsx:128-155, 91-98)
- Bulk-add note status message provides affirming feedback after ingredient decrement (App.tsx:57-60)

**UX flow:**
- Tab bar at footer remains sticky with aria-current for context (App.tsx:165-180)
- Missing: loading skeleton during camera init or barcode scan pending state

**Feature additions:**
- LowStockPredictor component could integrate a "reorder these next week" nudge on Pantry tab

**Cleanup / tightening:**
- CollectIngredientNames helper should move to lib/types.ts alongside CookedMealRow (App.tsx:185-196)

---

### showcase-parade-companion

**Stack:** Vite + React 19.2.5, showcase-kit-v2 (no CSS shipped), self-hosted fonts (offline-first), Arsenal red / cream / gold palette
**Summary:** Offline match-day companion for Islington parade. Map, group meet planner, safety info. Zero network requirement after load.
**UI polish:**
- Wordmark band (red rule, Arsenal type, unofficial meta) creates strong brand anchor (App.tsx:136-140, styles.css:154-180)
- ReadinessChip and ToastHost are kit-v2 skins properly implemented (.shippie-qr-sheet skin: styles.css:914-983)

**UX flow:**
- Hash-sync pattern supports cross-window import (parent/iframe safe) AND standalone URL hash share (App.tsx:64-105)
- Parade day banner displays inline with conditional logic (App.tsx:142-144)

**Feature additions:**
- ImportStatus toast could auto-dismiss after 6s (currently no timeout)

**Cleanup / tightening:**
- readShareHash and clearShareHash are file-level utilities; move to lib/hash-sync.ts for reuse

---

### showcase-photo-a-day

**Stack:** Vite + React 19.2.5, observations client, on-device AI labels (ONNX), IndexedDB, sepia/cream contact-sheet aesthetic
**Summary:** Daily photo capture with async AI labeling. Save-first, enrich-later. Grid calendar view. No photo bytes leave device.
**UI polish:**
- Capture card uses pseudo-elements for film-frame corner crop marks (styles.css:120-130, 208-220)
- "Labelling…" state in hero section prevents visual jank during classification (App.tsx:131-133)

**UX flow:**
- Empty state messaging differentiates "no photos" vs. "labels pending" (App.tsx:97, 138-139)
- File input reset after selection prevents accidental re-upload (App.tsx:46)

**Feature additions:**
- Could add label search/filter on Calendar tab to revisit "pizza days" or similar patterns

**Cleanup / tightening:**
- labelInBackground catch clause silently degrades; consider toast or persistent error banner (App.tsx:85-89)

---

### showcase-pitch-forge

**Stack:** Vite + React 19.2.5, forest-green accent, rich document editor with version snapshots, print view, Fraunces serif
**Summary:** On-device pitch drafting for grants/RFPs. Multi-section markdown editor, brief capture, version compare, printable output.
**UI polish:**
- Snapshot button invokes milestone texture + broadcasts pitch-drafted intent (App.tsx:196-215)
- Print view includes no-print class guards and PDF-safe layout (styles.css:687-704)

**UX flow:**
- Screen.kind union type ensures type-safe routing with exhaustive pattern matching (App.tsx:39-46, 54-66)
- NavTarget derived state prevents nav buttons from appearing on detail screens (App.tsx:262-269)

**Feature additions:**
- Draft assistant section could integrate AI codemod to auto-expand sections based on context

**Cleanup / tightening:**
- App.tsx:339: unused `deletePitch` reference in onBack handler

---

### showcase-quartet

**Stack:** Vite + React 19.2.5, juice sound bank, confetti, daily puzzle + 30-archive
**Summary:** Wordle-like word-grouping game. Daily+archive modes, streak tracking, 4 mistakes limit, share emoji grid.
**UI polish:**
- Solved band animations use scale transform with cubic-bezier easing (styles.css:100-105)
- Mistake dots and streak display update live without re-render cost (App.tsx:273-276)

**UX flow:**
- One-away toast only surfaces for 3/4 matches (App.tsx:240-244), teaching without spoiling
- Archive nav only appears after solve or in archive mode (App.tsx:298-309)

**Feature additions:**
- Share grid could include difficulty percentile reference as footer text

**Cleanup / tightening:**
- Shuffle button currently only shakes; consider actually rotating unsolved tiles (App.tsx:207-212)

---

### showcase-quiet

**Stack:** Vite + React 19.2.5, dark mode (14120F bg, EDE4D3 fg), conic-gradient progress ring, golden accent
**Summary:** Minimal ritual surface for breath (60s), focus (25min), and mood logging. Dark/calm aesthetic.
**UI polish:**
- Ring uses CSS conic-gradient for progress without canvas (styles.css:97-107, App.tsx:156)
- Wakelock attribute set on running state (App.tsx:132) keeps screen awake during timed sessions

**UX flow:**
- Mode toggle stops running session first (App.tsx:146-147), preventing orphaned timers
- Mood textarea caps input at 160 chars client-side (App.tsx:177)

**Feature additions:**
- Mood log could integrate summary stats (avg mood this week) in header hint

**Cleanup / tightening:**
- useRef trio (startedAt, running, elapsed) could collapse into single useReducer (App.tsx:38-42)

---

### showcase-reaction

**Stack:** Vite + React 19.2.5, observations client, percentile flavor text (tanh CDF), 14-day ribbon history
**Summary:** Reaction time game. Wait-for-green tap. Best-of-day + 5-trial median. Tone-coded ribbon. Percentile feedback.
**UI polish:**
- Tone function maps time bands to gradient (App.tsx:139-146)
- Ribbon displays last 14 days with title tooltip (App.tsx:193-199)

**UX flow:**
- Too-early state is forgiving (friendly feedback, tap to retry) vs. harsh error (App.tsx:178-182)
- Reset button only appears during waiting/go phases (App.tsx:186-188)

**Feature additions:**
- Could persist device-wide best and compare vs. global cohort stats (currently server-less)

**Cleanup / tightening:**
- percentileFor function uses tanh approximation; could add comment explaining why (App.tsx:59-68)
