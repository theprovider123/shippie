# Chiwit + Palate Showcase Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `showcase-chiwit` to the radical "garden/prose" design and build a new `showcase-palate` kitchen companion to the "Palate Radical" design; retire showcase-recipe (old Palate), showcase-mise, showcase-cooking and showcase-dough so palate becomes the one cooking app; ship to prod (apps live on the admin maker profile already — first-party showcase ownership is assigned to devanteprov via migration 0051).

**Architecture:** Two standalone Vite + React 19 showcase apps following the established Shippie idiom — `mountShowcase` boot, `@shippie/iframe-sdk` (intents/feel), single `styles.css` of CSS custom properties, debounced localStorage persistence, self-hosted woff2 fonts, `bun:test` + happy-dom tests. Platform integration via `curatedAppSpecs` registry + `prepare-showcases.mjs` bake + wrangler deploy.

**Tech Stack:** React 19.2.5, Vite 6, TypeScript 5.7, @shippie/iframe-sdk + @shippie/showcase-kit, bun:test/happy-dom, Playwright (_shotkit) for visual QA, Cloudflare Workers deploy.

**Design authorities (read FIRST, in order):**
1. `docs/superpowers/specs/2026-06-11-chiwit-design-spec.md` + raw `/Users/devante/Documents/chiwit design/Chiwit.dc.html`
2. `docs/superpowers/specs/2026-06-11-palate-design-spec.md` + raw `/Users/devante/Documents/palate design/Palate Radical.dc.html`
3. Reference idiom app: `apps/showcase-coffee` (lot.) — boot, fonts, storage, manifest patterns.

---

## Operating rules (ALL agents — non-negotiable)

- Branch `feat/dock-harmonization` is a Codex-collision tree. **Stage explicitly** (`git add apps/showcase-chiwit` etc.; NEVER `git add -A` / `git add .`), re-check `git log -1` before each commit; if HEAD moved unexpectedly, stop and surface it.
- Builder A touches ONLY `apps/showcase-chiwit/`. Builder B touches ONLY `apps/showcase-palate/`. Platform files (`apps/platform/**`) are the orchestrator's (Phase C).
- Commit per deliverable (small, frequent). Conventional commits: `feat(chiwit): …` / `feat(palate): …`.
- Verify before claiming done: `bun run typecheck && bun test src/ && bun run build` green inside your app dir.
- Philosophy gates: chiwit — no streak mechanics anywhere (not in DB, not computed), mood stored/displayed only as one of five word strings, skipped meds neutral, every observation ends "· just an observation"/"· just something noticed". palate — no "smart" in copy, no analytics, no external requests, no shadows/gradients, hairline borders only, no `!important`, no console.log in production paths.
- All numerals in palate get `font-variant-numeric: tabular-nums`.

---

## Phase 0 — Workspace prep (orchestrator)

### Task 0.1: Checkpoint in-flight work
- [ ] `git status --short` → commit ALL pre-existing uncommitted changes as `chore(workspace): checkpoint in-flight work before chiwit/palate rebuild` (explicit paths). This protects Codex WIP (platform feedback/report sheets, showcase-lift/match-room/recipe/snake edits) before showcase-recipe is deleted.

### Task 0.2: Fonts for palate
- [ ] Create `apps/showcase-palate/public/fonts/` — copy from `apps/showcase-coffee/public/fonts/`: `playfairdisplay-400-normal.woff2`, `playfairdisplay-500-normal.woff2`, `playfairdisplay-600-normal.woff2`, `playfairdisplay-400-italic.woff2`, `playfairdisplay-500-italic.woff2`, `dmsans-400-normal.woff2`, `dmsans-500-normal.woff2`, `dmsans-600-normal.woff2`.
- [ ] Source Serif 4 italic (400 + 500): download woff2 via Google Fonts CSS API (`curl -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@1,400;1,500&display=swap"` → fetch the latin woff2 URLs) into the same dir as `sourceserif4-400-italic.woff2` / `sourceserif4-500-italic.woff2`. Fallback if download fails: font stack `'Source Serif 4', Georgia, 'Times New Roman', serif` with Georgia italic standing in (note it for the fidelity review).
- [ ] Write `apps/showcase-palate/public/fonts/fonts.css` with @font-face blocks (`font-display: swap`), mirroring coffee's file.
- [ ] Logo + icons: copy `/Users/devante/Documents/palate design/assets/palate-logo.png` → `apps/showcase-palate/public/brand/palate-logo.png` (downscale to ≤512px wide via `sips -Z 512`); derive `icon-512.png`/`icon-192.png`/`apple-touch-icon.png` from `/Users/devante/Documents/Palate/palate app icon.png` (`sips -z 512 512` etc.). For chiwit: lotus `/Users/devante/Documents/chiwit design/uploads/icon.png` → downscale → replace `apps/showcase-chiwit/public/icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `public/brand/chiwit-logo.png`.
- [ ] Scaffold `apps/showcase-palate/` (package.json, tsconfig, vite.config port **5268** — 5180 is ALSO held by shippie-ai, do not reuse; port must be NESTED under `server: { port: 5268 }` (top-level `port:` is ignored by Vite — chiwit currently has this bug, Builder A fixes it for 5251), index.html, shippie.json below, empty src/) so Builder B starts from a compiling skeleton. Copy tsconfig/vite patterns from showcase-coffee verbatim.

`apps/showcase-palate/shippie.json` (exact):
```json
{
  "name": "Palate",
  "slug": "palate",
  "description": "A chef's kitchen companion. Wind a dial, run the rail of timers, glance cook mode, probe temps, scale a baker's formula — offline, all local.",
  "icon": "/icon-512.png",
  "theme_color": "#b85c26",
  "background_color": "#f7f3ec",
  "visibility": "public",
  "display": "standalone",
  "orientation": "portrait",
  "intents": {
    "provides": ["cooking-now", "cooked-meal", "shopping-list", "dough-ferment-started", "dough-ready"],
    "consumes": ["pantry-inventory", "shopping-list"]
  },
  "data_schemas": {
    "formulas": { "id": "text primary key", "name": "text not null", "version": "integer", "total_dough_g": "real", "notes": "text", "created_at": "integer", "updated_at": "integer" },
    "formula_ingredients": { "id": "text primary key", "formula_id": "text", "name": "text not null", "bakers_pct": "real not null", "is_prefermented": "integer", "hydration_pct": "real", "sort_order": "integer" },
    "timers": { "id": "text primary key", "label": "text not null", "context": "text", "duration_s": "integer not null", "started_at": "integer", "paused_at": "integer", "status": "text", "colour": "text", "created_at": "integer" },
    "ferments": { "id": "text primary key", "name": "text not null", "type": "text", "started_at": "integer", "target_duration_s": "integer", "dough_temp_c": "real", "room_temp_c": "real", "status": "text", "notes": "text", "updated_at": "integer" },
    "bakes": { "id": "text primary key", "formula_id": "text", "baked_at": "integer", "crumb_score": "real", "rise": "integer", "crumb": "integer", "crust": "integer", "flavour": "integer", "ease": "integer", "photo_data": "text", "what_changed": "text", "notes": "text" },
    "kitchen_notes": { "id": "text primary key", "content": "text", "created_at": "integer" }
  },
  "data_passport": { "family": "palate", "schema": "palate.v2" },
  "data": { "localStorage": { "keys": ["shippie.palate.kitchen.v1", "shippie.palate.bake-photo.*"] } },
  "curation": { "surface": "featured", "category": "food-drink", "tier": "public-flagship" },
  "source_repo": "https://github.com/theprovider123/shippie/tree/main/apps/showcase-palate",
  "license": "MIT",
  "remix_allowed": true
}
```
(Mirror showcase-recipe's current shippie.json for exact field names the validator expects. **This intent list is THE canonical one** — `state.ts`'s palate entry must match it exactly (the old entry provided pantry-inventory/pantry-low/meal-planned; the new app does NOT — meal-planner still provides meal-planned and it's allowlisted; pantry-scanner still provides pantry-inventory/pantry-low). `timer-state`/`probe-reading` were deliberately dropped: they're local UI state, not cross-app intents — broadcast nothing for them.)

---

## Phase A — Builder A: rebuild `apps/showcase-chiwit` (Sonnet agent)

**Read first:** chiwit design spec doc + `Chiwit.dc.html` + current `apps/showcase-chiwit/src/App.tsx` (to understand the boot/intent plumbing you are KEEPING) + `apps/showcase-coffee/src/App.tsx` (idiom).

**Keep:** slug `chiwit`, port 5251, `mountShowcase` boot, intent provides/consumes set (mood-logged, sleep-logged, hydration-logged, workout-completed, mindful-session, symptom-logged, body-metrics-logged / cooked-meal, caffeine-logged, coffee-brewed, brewed-tea, wellness-ritual), backup via `@shippie/backup-providers` + showcase-kit-v2 `BackupCard`, `IntentToastHost`.
**Replace:** the entire UI (current cool-sage "instrument" look → warm paper/Georgia garden design), the data model (pulse scores → garden model). **Delete:** pulse score/elevation engine, WeeklyShape canvas (replaced by Letter), numeric mood anywhere.

### Task A1: Data layer `src/lib/store.ts` + types
- [ ] New storage key `shippie.chiwit.garden.v1` (leave old `shippie.chiwit.daily-pulse.v1` untouched on disk; add a one-time, lossless import: old hydration entries → water counts, old mood entries discarded — numeric moods cannot become words honestly; note this in a code comment). Update `shippie.json` localStorage prefixes if present.
- [ ] Types (exact):
```ts
export type MoodWord = 'heavy' | 'low' | 'okay' | 'light' | 'bright';
export type ThingKind = 'medication' | 'water' | 'movement' | 'sleep' | string; // string = adopted custom words
export interface DayLog {
  date: string;                      // YYYY-MM-DD local
  mood?: MoodWord;                   // the word, never a number
  things: Record<string, ThingEntry>;
  journal: JournalEntry[];
  intention?: string;                // tomorrow's one small intention (set the evening before)
}
export interface ThingEntry { kind: ThingKind; action: 'done' | 'skipped'; count?: number; detail?: string; at: number; }
export interface JournalEntry { id: string; text: string; at: number; }
export interface Letter { id: string; weekEnding: string; body: string; pills: string[]; arc: (MoodWord | null)[]; }
export interface ChiwitState {
  version: 1;
  days: Record<string, DayLog>;
  adoptedWords: string[];            // from WORD_CATALOG + custom
  letters: Letter[];
  dismissedObservations: string[];
  ambient: AmbientEvent[];           // folded cross-app intents (coffee, meals…)
  exports: { kind: 'therapy-export'; at: number }[];  // for the Data screen "was shared" row
}
```
- [ ] Debounced (300ms) persistence; load with version guard. Tests: round-trip, migration no-op when old key absent, water import mapping.

### Task A2: Observation engine `src/lib/observations.ts`
- [ ] Pure functions over `days` + `ambient`. Rules (each returns `{id, icon, text, evidence, microcopy}` or null): movement↔mood ("on days you moved, your evening mood tended lighter" — compare mood-word rank distribution on moved vs not days, require ≥7 days evidence and a real lean), journal↔heavy days, coffee(ambient `coffee-brewed`/`caffeine-logged` after 15:00)↔short sleep (≥3 co-occurrences), period→migraine lead (if those words adopted, ≥7 occurrences). Mood ranking exists ONLY inside this module for comparison — never exported, never rendered.
- [ ] Every `microcopy` literally ends with "just something noticed" or "worth knowing, nothing more". Minimum evidence constant `MIN_EVIDENCE = 7`.
- [ ] Tests with fixture data: below-threshold returns null; dismissal honoured; copy suffix invariant enforced by a test iterating all rules.

### Task A3: Sentence parser `src/lib/parser.ts` (voice/dictation)
- [ ] `parseDayText(text: string): ParsedItem[]` — deterministic extraction: meds ("took my meds", "skipped my meds" → skipped action), sleep ("slept (about )?(six and a half|6.5|7) hours" → word-number table + h fractions), water ("two glasses" → count), movement ("walk|walked|run|yoga|gym|studio"), mood (map phrases: "somewhere in the middle"→okay, "rough/heavy"→heavy, "good/light"→light, "great"→bright, "low/flat"→low). Returns phrase + kind + detail for the confirm list.
- [ ] **Canonical test fixture** — this exact transcript MUST parse to exactly these 5 items:
```ts
const TRANSCRIPT = "took my meds with breakfast… slept about six and a half hours. walked over to the studio. two glasses of water so far. feeling… somewhere in the middle today.";
expect(parseDayText(TRANSCRIPT)).toEqual([
  { kind: 'medication', phrase: 'meds with breakfast', action: 'done', detail: 'this morning' },
  { kind: 'sleep', phrase: 'about six and a half hours', action: 'done', detail: '6.5h' },
  { kind: 'movement', phrase: 'walked to the studio', action: 'done', detail: undefined },
  { kind: 'water', phrase: 'two glasses of water', action: 'done', count: 2, detail: undefined },
  { kind: 'mood', phrase: 'somewhere in the middle', mood: 'okay' },
]);
```
(Adjust the exact `phrase`/`detail` strings to what your implementation naturally produces, but the kinds, count, mood word, and 5-item shape are fixed.)
- [ ] Tests: fixture above; "skipped my meds" → `{action:'skipped'}`; garbage text → [].

### Task A4: Letter generator `src/lib/letter.ts`
- [ ] **Week definition (fixed):** weeks run Sunday→Saturday in LOCAL time (matches the old WeeklyShape `getDay()` convention). The Today screen's "N days of little things this week" count also uses this boundary, resetting Sunday 00:00 local. Derive all `date` strings from LOCAL time (`new Date()` parts — NEVER `toISOString().slice(0,10)`, which is UTC and misfiles late-night entries).
- [ ] `composeLetter(days, weekEnding): Letter` — assembles 3–5 sentences from real data using these exact slot-fill templates (pick the matching variant; skip a clause when its data is absent — never fabricate):
  - heavier days: `"You had a heavier {dayNames} — {journalClause}But {movedClause}"` where journalClause = `"you wrote “{fragment}” on {day} night, which tracks. "` (first ≤4-word journal fragment from a heavy/low day) or empty; movedClause = `"you walked {bothBoth} anyway. That's a thing you do, apparently, even when it's hard."` or `"the week carried you through."`
  - lighter stretch: `"Your evenings ran lighter from {day} onwards."` (≥2 consecutive light/bright days after a heavier patch)
  - coffee/sleep: `"The late coffees still seem to be shortening your sleep. {n} times this week. Worth knowing, nothing more."` (only when the observation engine has the evidence)
  - quiet week: `"A quieter week — {n} days logged, and that's fine. The garden keeps growing either way."`
  - always closes: `"Small things, most days — that's how a week like this gets built."`
- [ ] Pills: "moved N days", "doses N/M", "avg X.Xh sleep" (only if sleep durations logged), "wrote N times". Never advises, never scores.
- [ ] Generation rule: on app open, if the most-recent COMPLETED Sun–Sat week has no letter in `letters[]`, generate it (regardless of which weekday it is now — opening on Wednesday still backfills last week's letter). Tests: deterministic output for a fixture week; empty week → the quiet-week letter, no fabricated stats; no duplicate letters on repeat opens.

### Task A5: Screens
Files: `src/App.tsx` (slim router/shell), `src/screens/Today.tsx`, `Garden.tsx`, `Letter.tsx`, `DataScreen.tsx`, `src/sheets/Voice.tsx`, `Tomorrow.tsx`, `YourWords.tsx`, `src/components/Stem.tsx`, `MoodLine.tsx`, `ThingLine.tsx`, `ObservationCard.tsx`, `NavBar.tsx`.
- [ ] **Today** = sentence concept (spec §3 Concept A): greeting, date line with coral "N days of little things this week" (descriptive count, resets weekly by calendar — not a streak), tappable mood prose line, habit prose lines (done = ink, pending = `#9E988A` italic; exact copy variants from spec), adopted-word lines animating in (`leafIn`), inline journal ("worth keeping?"), stem+bloom flourish when all four core things are done, quiet links: "speak it" (Voice sheet), "tomorrow", "your words". 
- [ ] **Voice sheet**: mic-circle visual + textarea ("speak or type it" — OS dictation), live parse → "I HEARD N THINGS — SOUND RIGHT?" rows with per-row check toggle + mood "change" pill, "keep all N" coral button writes entries, footer "the voice note itself is gone — unless you want it saved".
- [ ] **Garden**: 14-day arc bars (mood word → height/colour mapping inside component only; missing day = dot + "a quiet day — gardens rest"), observation cards (dismissible) and the woven prose section below with coloured spans + legend "plum is body · coral is mood · amber is habit".
- [ ] **Letter**: 7-bar mini arc, current letter card, lock meta line, stat pills, EARLIER LETTERS archive.
- [ ] **Data**: legend (3 dots), items card with badges from real state (therapy export row only after an export; backup row state from BackupCard), envelope footer copy, BackupCard + export actions (therapy export = formatted text/JSON download via existing showcase-kit-v2 patterns; record to `exports`).
- [ ] **Tomorrow / Your Words** sub-screens per spec §3. WORD_CATALOG: body(period, bloating, migraine, energy), mind(reading, meditation, worry), moving(stretching, a run, yoga) + free custom.
- [ ] NavBar: 4 stroke icons (Today sun, Garden leaf, Letter envelope, Data person/lock per mockup), active coral.
- [ ] `styles.css` rewritten from the token table in the spec (Georgia stack `Georgia, 'Times New Roman', serif`; system sans stack). 0.5px borders via `border-width: 0.5px` (renders as hairline on retina; acceptable 1px on 1x). **INVARIANT (CLAUDE.md): showcase-kit-v2 ships zero CSS — the `.shippie-onboarding/.shippie-intent-toast/.shippie-qr-sheet/.shippie-backup-card/.shippie-empty-state` skin block (~56 rules, see the current styles.css for the reference) MUST be carried over and repainted in the new warm palette**, or those components render visibly broken.
- [ ] Intents — **exact wire contract, non-negotiable**: `mood-logged` MUST emit `{ score: <1–5 rank of the word: heavy=1, low=2, okay=3, light=4, bright=5>, label: <the word>, note?, logged_at }`. The numeric `score` exists ONLY on the wire (the `breath-on-low-mood` agent strategy gates on `score <= 2` and rejects non-numbers; `packages/intents` pins `mood-logged → mood.rating.v1`). It is never stored, never rendered — the philosophy gate is about storage/display. Emit `hydration-logged`, `sleep-logged`, etc. exactly where and in the shape the old app emitted them (check current App.tsx:573/:1046 before rewriting). Consume ambient intents into `ambient` (IntentMatchers.ts adapted, not deleted).
- [ ] Tests: Today line copy for each state, nav, water increments, all-four bloom trigger.

### Task A6: Polish + verify
- [ ] manifest.webmanifest (name "Chiwit", theme `#A84136`, bg `#F7F4EF`), index.html meta/title/icons, shippie.json description refresh ("A wholesome personal tracker. Five mood words, the little things, a garden of your days — local, kind, yours.") — keep slug/intents/curation valid.
- [ ] `bun run typecheck && bun test src/ && bun run build` green; commit per task throughout.

---

## Phase B — Builder B: build `apps/showcase-palate` (Sonnet agent)

**Read first:** palate design spec doc + `Palate Radical.dc.html` (open it and study the actual interaction JS inside) + `apps/showcase-coffee/src` (idiom) + `apps/showcase-lift/src/utils/wake-lock.ts`.

### Task B1: Data layer `src/lib/store.ts` + engine `src/lib/engine.ts`
- [ ] Storage key `shippie.palate.kitchen.v1`, single debounced blob. **Photos are NOT in this blob**: each bake photo lives in its own key `shippie.palate.bake-photo.<bakeId>` (downscaled JPEG dataURL ≤200KB), written in its own try/catch — on QuotaExceededError show a quiet "photo not saved — storage full" note and keep the bake entry; cap retained photos to the 12 most recent bakes (older photos deleted, bake keeps a placeholder). The main blob's `setItem` is also try/catch-wrapped so a quota failure never silently loses kitchen state. **Timer reload reconciliation:** on load, any `running` timer whose wall-clock remaining ≤ 0 is reconciled to `status:'done'` WITHOUT firing the milestone haptic/intent (those are live-only). Glance position resumes (persisted stepIndex), and glance step timers are wall-clock-anchored via the same `started_at` mechanism as rail timers, so they survive reload honestly.
```ts
export interface PalateState {
  version: 1;
  timers: Timer[];            // {id,label,context,duration_s,started_at,paused_at,status:'idle'|'running'|'paused'|'done',colour:'green'|'amber'|'red',created_at}
  ferments: Ferment[];        // {id,name,type:'bulk'|'proof'|'levain'|'kimchi'|'miso'|'kombucha',started_at,target_duration_s,dough_temp_c,room_temp_c,status,notes,fed_at?,folds?:number[]}
  formulas: Formula[];        // {id,name,version,total_dough_g,notes,ingredients:FormulaIngredient[],created_at,updated_at}
  bakes: Bake[];              // crumb axes 1–5 each; crumb_score = avg×2; photo stored SEPARATELY (see below)
  notes: KitchenNote[];
  probe: { cut: string; unit: 'C'|'F'; current_c: number };
  glance: { stepIndex: number; workflowId: string };
}
```
- [ ] `engine.ts` pure functions + tests for each:
  - `remainingSeconds(timer, now)` (running/paused/done; one global 1s tick in App).
  - `q10Remaining(target_s, elapsed_s, dough_temp_c, ref=24, q10=2)` → `(target_s − elapsed_s·rate)` with `rate = q10^((dough_temp_c − ref)/10)` (warmer dough ferments faster → less remaining time).
  - `scaleFormula(formula, total_g)` → grams per ingredient (flour rows sum to 100%, grams = pct/flourPct·flourMass), `trueHydration` (levain water counted via its hydration_pct), `prefermentedPct`, `saltPct` + `saltInRange` (≤2.5).
  - `ddtWaterTemp(ddt, room, flour, friction)` = `ddt*3 − room − flour − friction`.
  - `probeState(current, pull)` → 'tracking' | 'nearly' (≤3° above-gap) | 'pull' (≥pull); `cToF` displays.
  - `eggPreset(base_s, large: boolean, fromFridge: boolean)` → +30s each.
  - Conversions table (flour 120g/cup, butter 227g/cup, honey 340g/cup, sugar 200g/cup, oats 90g/cup, cocoa 85g/cup, oil 218g/cup …) + oven map (conventional→fan −20°C, gas mark table, °F) + substitutions list (buttermilk→milk+acid, egg→flax egg, …≥10 entries).

### Task B2: The Rail (home) `src/screens/Rail.tsx`
- [ ] Hero (most urgent non-long item) + tickets sorted by remaining; heat tint by `context === 'oven'`/kind heat; long ferments sink with muted Playfair day counts; tap-to-expand (+1:00 / done); add-timer affordance (quiet "+ a ticket" row → label/duration/context sheet); kitchen-note dashed card at rail bottom (mobile). Hero tap clears when done. Per-second tick re-sorts.
- [ ] On timer completion: `shippie.feel.texture('milestone')` + broadcast `timer-state` intent `{id,label,remaining_s:0,status:'done'}`; broadcast on start/pause too.

### Task B3: The Dial `src/screens/Dial.tsx`
- [ ] SVG dial per spec (ticks/ring/arc/needle/centre face), pointer-drag bezel winding (angle→minutes 0–60, 30s quantize, outer-band hit test), tap face start/stop/reset, colour state machine (idle grey/running sage/<2min amber/done terracotta + face fill), egg presets row + size/fridge toggles (+30s each), running dial writes a rail ticket (label "Eggs, jammy" etc.) so the rail always reflects it.

### Task B4: Glance `src/screens/Glance.tsx`
- [ ] 9-step country-loaf workflow (exact copy from spec), colour-as-interface palettes, 600ms bg transition, tap-anywhere advance, progress dots, step timer chips (tap to start → rail ticket), wake lock (acquire on mount/release on unmount + visibilitychange re-acquire, copy showcase-lift util), `feel.texture('tap')` on advance. Completing the final step → broadcast `cooked-meal {meal_name: workflow.name, cooked_at}` + `cooking-now` cleared.

### Task B5: The Probe `src/screens/Probe.tsx`
- [ ] Big temp display (tap to reset to pull−8), vertical drag / ± steppers set current temp, cuts list retarget, state palettes (tracking/nearly/pull) with 600ms transitions, progress track + pull marker, °C/°F persisted toggle, carryover footer; broadcast `probe-reading {label, temp_c, target_c, pull_c}` on changes (throttled ≥1/s).

### Task B6: The Scale `src/screens/Scale.tsx`
- [ ] Full-screen ew-resize pointer drag (setPointerCapture, 3× multiplier, 10g quantize, 600–3200g), bottom-anchored formula rows, stats footer with `salt in range`/over-range warning, formula editor sheet (add/edit ingredients, flour-sums-to-100 enforcement with auto-rebalance of flour rows, preferment flag + hydration), save/load formulas, per-piece column when pieces>1, "send to shopping list" → one `shopping-list` intent broadcast with all ingredient rows `{item, quantity, unit, source:'palate'}`.

### Task B7: Ferments + More
- [ ] `src/screens/FermentDetail.tsx`: bulk (dough temp input → Q10 remaining + fold schedule ticks), levain (fed-at, flat/building/peaked/falling status words, next-feed calc), long (day x of y timeline + burp prompt). New-ferment sheet (type/start/target). Active ferments emit `dough-ferment-started` on create; `dough-ready` when Q10 remaining hits 0.
- [ ] `src/screens/More.tsx` quiet word-list → `Ddt.tsx`, `Convert.tsx`, `Log.tsx` (bake log + CrumbScoreEntry five 1–5 axes, avg ×2 readout as plain numbers, photo attach via file input → downscaled dataURL), kitchen note editor.

### Task B8: Shell + styles
- [ ] `src/App.tsx`: header ("palate." Playfair italic + always-visible "offline · all local" with crossed-wifi icon), screen switcher (quiet word row `rail · dial · glance · probe · scale · more`), global 1s tick, intent subscriptions (`pantry-inventory`, `shopping-list` → surface as quiet hints in Scale/More, e.g. "flour is low in pantry"). **Use `createLocalNavigation<Screen>(…)` — it is the idiom, not optional** (coffee App.tsx:85 and current chiwit both use it; it wires browser back/forward + container nav).
- [ ] `styles.css` from the token table; fonts.css link + preloads in index.html; manifest.webmanifest (name "Palate", theme `#b85c26`, bg `#f7f3ec`) with icon paths/sizes mirroring coffee's manifest exactly (icon-192/icon-512/apple-touch — missing sizes break the container install flow).
- [ ] Tests: engine functions (Task B1), rail sorting/hero selection, dial angle↔time mapping, scale clamp/quantize, probe state transitions, timer reload reconciliation.

### Task B9: Desktop Counter (its own task — this is a second layout, not a media query)
- [ ] ≥1100px: Counter grid `0.95fr 1.35fr 0.95fr` (rail | probe | dial+note) per spec. The dial renders at 240px (vs 330 mobile) — bezel pointer-drag hit-testing must be radius-proportional, not hardcoded; dial state is shared so "wind either one" holds (same component, size prop). Probe at Playfair 148px full-height card; tonight's-note dashed card with autosave-on-blur. Glance/scale open full-bleed from the switcher. Header gains "· 2 devices on kitchen LAN" ONLY if the container actually reports peers (otherwise omit — don't fake it).
- [ ] `bun run typecheck && bun test src/ && bun run build` green; commit per task.

---

## Phase C — Platform wiring (orchestrator)

### Task C1: Remove the four apps
- [ ] `git rm -r apps/showcase-recipe apps/showcase-mise apps/showcase-cooking apps/showcase-dough`; also delete their baked outputs `apps/platform/static/__shippie-run/{palate,mise,cooking,dough}` if present (prepare script may not prune).
- [ ] `apps/platform/src/lib/container/state.ts`: delete the mise/cooking/dough curatedAppSpecs entries; REPLACE the existing palate entry (slug `palate`, port **5268**, intents EXACTLY matching the canonical shippie.json list above — the old entry's pantry-inventory/pantry-low/meal-planned provides go away); category `food-drink` in both state.ts and shippie.json; update chiwit's entry description/intents if Builder A changed anything.
- [ ] Fix `intent-graph.test.ts` — known fallout, verified against the test: palate must keep providing `cooked-meal` (hard assertion `providers…toContain('palate')`); `cooking-now`/`cooked-meal` keep palate as provider ✓; `dough-ferment-started`/`dough-ready` move provider from dough→palate ✓; `meal-planned` keeps provider meal-planner and is already in ALLOWED_ORPHAN_PROVIDERS (its only consumer, mise, is gone) ✓; mise's nutrition kinds (`nutrition-logged`, `meal-logged`, `protein-target-hit`, `macro-target-updated`) become dead allowlist entries — leave them, optionally prune comments; pantry-inventory/pantry-low keep provider pantry-scanner ✓. Do NOT add `timer-state`/`probe-reading` anywhere — they were cut. Gate: `cd apps/platform && bunx vitest run src/lib/container/intent-graph.test.ts`.
- [ ] Grep sweep: `grep -rn "showcase-recipe\|showcase-mise\|showcase-cooking\|showcase-dough\|'mise'\|'dough'\|'cooking'" apps/platform/src scripts docs/CURRENT_STATE.md` — fix references (shotkit CONFIGS, seeds in docs, any /tools copy). Update `_shotkit/shoot.mjs` CONFIGS: remove the four, add palate + new chiwit screens.

### Task C2: D1 migration — `apps/platform/drizzle/0063_retire_kitchen_apps.sql` (0062 is current max; re-verify before writing)
- [ ] Archive pattern (verified): set `surface='archived'` (hides from shelves, the 0052 retired-apps precedent), keep `visibility_scope='public'`, leave `is_archived=0` (that's the takedown boolean — different column). Apply to slugs `mise`, `cooking`, `dough`. Do NOT delete rows (provenance).
- [ ] **The marketplace `/apps/palate` page reads `apps.description` from D1, not shippie.json** — without this UPDATE prod ships the stale recipe copy. Include: `UPDATE apps SET description='A chef''s kitchen companion. Wind a dial, run the rail of timers, glance cook mode, probe temps, scale a baker''s formula — offline, all local.', theme_color='#b85c26', background_color='#f7f3ec', updated_at=<now> WHERE slug='palate';` (match actual column names against the schema before writing).
- [ ] `bun run db:migrate:local` + verify rows. Prod migration is forward-only — there is NO down-migration; rollback story is wrangler deployment rollback only, the D1 change stays (note this in the deploy step).

### Task C3: Bake + health
- [ ] `cd apps/platform && bun run prepare:showcases:all` (the full path prunes orphan baked dirs via `pruneStaticRuntime`; `--generated-only` does NOT prune — never use it here). Manual `rm -rf` of `static/__shippie-run/{mise,cooking,dough}` stays as belt-and-suspenders. Catalog regenerates without the retired apps, with new palate + chiwit.
- [ ] Repo root: `bun run health` (typecheck + test + build all green). `audit-showcase-storage.mjs` runs inside the platform build and fails on catalog↔static drift — that's the real gate. Fix fallout (generated catalog imports, curation tests).
- [ ] Diff the uncommitted-then-checkpointed `[slug=appslug]` route param work against the assumption that `/run/palate` resolves normally — confirm before Phase G.

## Phase D — Design fidelity loop (orchestrator + refine agents)
- [ ] **Build first** — `_shotkit/shoot.mjs` serves each app's `dist/`, not the dev server (apps with no dist are SKIPped). `bun run build` in each app, then update shotkit CONFIGS and screenshot at 412×900@2x: chiwit (today empty, today logged, voice sheet parsed, garden, letter, data, your-words) and palate (rail, rail-expanded, dial running, glance step1/REST + bake/HEAT, probe nearly + pull, scale, more, desktop 1400×880 counter).
- [ ] Open `Chiwit.dc.html` and `Palate Radical.dc.html` in Playwright, screenshot the corresponding mockup frames, and compare side-by-side (typography scale, colour fidelity, spacing rhythm, copy). Produce a diff list; dispatch refinement agents per app until the build matches or beats the mockups. Hard checks: Playfair numerals tabular, hairline borders (no shadows anywhere), glance bg colours exact, chiwit Georgia voice + 0.38 fade, coral `#A84136` not generic red.

## Phase E — Cross-browser/device QA
- [ ] Playwright runs against built `vite preview` bundles: chromium + webkit (install if missing), viewports 375×812, 412×900, 768×1024, 1400×880. Interaction scripts: full chiwit log day → garden → letter; palate wind dial → ticket appears on rail → +1:00 → done; scale drag; glance advance with wake-lock API stubbed; probe retarget. Console-error budget: zero.
- [ ] Verify offline: build served, network offline → app fully functional (no external requests; check via Playwright request log — any third-party URL is a failure).

## Phase F — Final review (Fable)
- [ ] Code review both apps (philosophy gates, intent payload shapes vs consumers, storage-key hygiene, dead code, test honesty) + final visual pass + CURRENT_STATE.md note.

## Phase G — Deploy
- [ ] Explicit-stage commits done; `git log` sane; push branch.
- [ ] Prod D1 migration: `cd apps/platform && bun run db:migrate` (= `wrangler d1 migrations apply … --remote`; the runbook's `db:push` is stale — that script doesn't exist). Run BEFORE build+deploy. Forward-only: rollback = `wrangler` deployment rollback only; the D1 change persists.
- [ ] `cd apps/platform && bun run deploy`.
- [ ] Verify: `https://shippie.app/run/palate` + `/run/chiwit` load the new apps; `/apps/palate` marketplace page sane; mise/cooking/dough no longer listed; admin profile shows both. Smoke-test one interaction each on prod.
