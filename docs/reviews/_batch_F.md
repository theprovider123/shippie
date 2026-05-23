### showcase-read-later
**Stack:** Vite + React 19, Readability, localStorage, mood-based hint feature
**Summary:** Article clipping with SSRF-guarded fetch via `/__shippie/proxy`, HTML sanitisation, mood-aware surfacing.

**UI polish:**
- Fraunces loaded across 3 weights (styles.css:6–88); reader h2/h3 margins don't match body paragraph rhythm — tighten to `18px 0 8px` (styles.css:80).
- Save form uses `border-radius: 999px` but article cards use `border-radius: 10px` — unify to 10px (styles.css:24 vs 40).

**UX flow:**
- Reader Back button (line 117) is plain text; add `aria-label="Back to list"` + visual hover feedback.
- Fetch errors lack a retry path; add "Try again" button (line 92).

**Feature additions:**
- Extend intent subscription to `pantry-low` and auto-append matching recipe articles.

**Cleanup / tightening:**
- Stale P3-adjacent comment on line 47; demote to TODO or remove now that shipped.

---

### showcase-receipt-snap
**Stack:** Vite + React 19, on-device OCR (Tesseract-like), IndexedDB, fflate, observations
**Summary:** Receipt scanner — OCR review, Quick / Accounting modes, photo discard policy, CSV export.

**UI polish:**
- Inactive tabs lack any underline (styles.css:82–86) — add a 1px guide for continuity.
- Review form padding 20px doesn't match the rest of the fleet's 18px gutters (line 291); standardise.

**UX flow:**
- OCR progress bar (line 279–283) has no cancel; user is stuck if recognition hangs. Add `onCancel` to CapturePage.
- "Accounting extras" disclosure (line 546–579) hides rich fields by default; surface a hint below the Quick/Accounting toggle.

**Feature additions:**
- Conditional `dined-out` broadcast — currently always emits; check restaurant category Set membership before emitting.

**Cleanup / tightening:**
- Dated "Accounting widening (2026-05-19)" comment (line 158–165); retire or convert to TODO.

---

### showcase-restaurant-memory
**Stack:** Vite + React 19, Geolocation API, Haversine dedup, photo blobs, share QR + PIN
**Summary:** Visit logger with photos, 150m geo-dedup within same name, share via QR + PIN, dined-out broadcaster.

**UI polish:**
- Sharp form corners (lines 71, 82, 99) clash with rounded lightbox close button (line 328); unify on sharp.
- Dedup banner (line 277–278) is too subtle visually; bump the rgba bg.

**UX flow:**
- Lightbox close button (line 322–337) doesn't apply `env(safe-area-inset-top)`; overlaps notch.
- Photo lazy-load only primes first 10 visits (line 165); add IntersectionObserver for the rest.

**Feature additions:**
- Visited-timeline date-picker overlay so users can jump to a month/year.

**Cleanup / tightening:**
- Replace `🔒` emoji on privacy ribbon (line 241) with accessible SVG icon (`aria-hidden`).

---

### showcase-shopping-list
**Stack:** Vite + React 19, proximity mesh, ML AisleClassifier, intent subscriber
**Summary:** Collaborative list with mesh join codes, aisle grouping, source badges (manual/mesh/pantry-low/meal-plan).

**UI polish:**
- "Group by aisle" checkbox is invisible (hidden by default); add a 20px square with `accent-color: var(--marigold)` (lines 303–312).
- Source badges (line 327) are colour-coded (lines 108–110) but lack a legend; new users don't know what green vs brown means.

**UX flow:**
- Join code input requires uppercase but doesn't auto-convert (line 154); `value={joinCode.toUpperCase()}` and sync.
- "Group by aisle" toggle vanishes when the list is empty (lines 301–312); keep it visible + disabled.

**Feature additions:**
- "Add via barcode" — camera input feeds the AisleClassifier to map UPC → item names.

**Cleanup / tightening:**
- P3 comment block (lines 27–35) telegraphs future work in code; move to a plan or CLAUDE.md note.

---

### showcase-show-and-tell
**Stack:** Vite + React 19, proximity mesh ONLY (no persistence), 30s auto-clear grace
**Summary:** Ephemeral mesh scratchpad — drop text/links, auto-clear when room empties.

**UI polish:**
- Link auto-format (lines 226–232) has no hint; add "Paste a link to auto-format" in placeholder when idle (line 190).
- Empty state is context-blind (lines 202–203); add a Room: off / live badge.

**UX flow:**
- Enter-to-post unsigned; add "Press Enter or tap Post" help text (line 192).
- Member-count poll every 2s flickers number; debounce or fade-transition.

**Feature additions:**
- "Save this room" — bookmark join code in localStorage for recent-rooms dropdown.

**Cleanup / tightening:**
- Tighten the verbose 7–18 comment block to one summary line.

---

### showcase-site-visit
**Stack:** Vite + React 19, local-db (SQLite-like), OPFS, signature pad, CSV/PDF export
**Summary:** Offline field inspection — Sites → Visits → Checks → Incidents; templates, photos, CSV, identity, print-view.

**UI polish:**
- Fixed bottom tab nav (lines 99–104) ignores `env(safe-area-inset-bottom)`; iPhone gesture bar will overlap.
- Status pills (lines 126–136) lack `font-weight: 600`; "PASS" / "FAIL" should be bolder.

**UX flow:**
- Print view (line 578–598) doesn't warn that data is captured in a snapshot; if user modifies after print, the printed copy is stale.
- Site creation (line 263–273) has no client validation; missing fields silently save `null`.

**Feature additions:**
- "Site photos gallery" — collect all photos across checks/incidents on a site, sorted by date.

**Cleanup / tightening:**
- CSV export (lines 461–485) builds rows synchronously; chunk via setTimeout or Web Worker for 10k+ checks.

---

### showcase-snake
**Stack:** Vite + React 19, custom 16x16 engine, juice, observations, Web Share API
**Summary:** Classic Snake — Classic/Loop/Daily modes, swipe + keyboard, daily streak, share result.

**UI polish:**
- D-pad uses `border-radius: 12px` but grid cells are square (lines 156 vs 107); unify to 0.
- Speed chip uses gradient fill (line 65–74); adjacent numerics don't — either gradient all or none.

**UX flow:**
- Swipe deadzone 14px (line 194) on a 320px viewport = 4% of width — too insensitive; reduce to 10px or scale by viewport.
- Game-over modal persists with no auto-dismiss; add a 3s countdown.

**Feature additions:**
- Replay-token mode: upload a base64 frame history and step through the snake's path.

**Cleanup / tightening:**
- Remove `react-hooks/exhaustive-deps` eslint-disable (line 176 pattern); refactor deps explicitly.

---

### showcase-snap-and-forget
**Stack:** Vite + React 19, IndexedDB blob storage, on-device labels (TFLite-like), dark "safelight" theme
**Summary:** Ephemeral photo memory — snap → save blob + thumb → classify labels → emit `place.snapped` → search by label.

**UI polish:**
- Capture disc 116px (lines 129–143) overflows on &lt; 320px viewports; add `max-width: min(116px, 80vw)`.
- Grid cells `aspect-ratio: 1` with `object-fit: cover` (lines 196, 199) crops tall photos; consider `object-fit: contain`.

**UX flow:**
- Labels stall at "labelling…" forever on classifier failure (lines 172–175); add exponential backoff or Retry button.
- Search input only appears when snaps > 0 (lines 150–158); show always (disabled with empty-state copy).

**Feature additions:**
- "Timeline by date" — group snaps by week/month, like Photos.app.

**Cleanup / tightening:**
- Tighten 1–5 dark/darkroom intro comment to one line.
