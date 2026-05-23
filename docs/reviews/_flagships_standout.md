# Standout pass — chiwit + recipe (2026-05-23)

Deep design review focused on what makes these apps **standout**, not just polished. Goes beyond the initial `_flagships.md` review.

---

## showcase-chiwit

**Current standout moments:**

- **Honesty-gated pulse** (App.tsx:316–380): The overall score renders as "—" rather than a defaulted number when fewer than three factors are logged. Rare in wellness apps; feels earned.
- **Ambient-signal architecture** (IntentMatchers.ts:40–132, App.tsx:475–496): Cross-app intents fold in without duplicating the pulse maths; adapter keeps SDK per-kind while kit's IntentToastHost surfaces a single callback.
- **Weekly-shape keepsake as contour, not grade** (WeeklyShape.tsx, App.tsx:583–608): 7-day ribbon tells a rhythm story; PDF footer reads `chiwit/wk-YYYY-WW` like a field-notes entry.

**Hero-moment improvements:**

1. **TodayView h1 at App.tsx:908** — Replace static "How are you today?" with a time-aware greeting (morning/afternoon/evening). Add tabular nums to the `reading` paragraph so "45" lands with the weight of a vital sign.
2. **WeekContour (App.tsx:858–880)** — Add a `<figcaption>` reading "Average pulse: {Math.round(average(values))}" so the shape has a number anchor.
3. **Quick-log pills (App.tsx:911–917)** — Add `<small className="factor-boost">Foundations</small>` so users learn the signal→factor mapping without a tutorial.
4. **PulseRing card (App.tsx:1285–1312)** — When `overall === null`, replace "—" with a progress ring (40% fill for current logged count / 3 required) to show momentum toward insight.
5. **Reading copy (App.tsx:266–300)** — "3 signals logged so far" should surface which factors are logged so users know what to log next.

**Information hierarchy fixes:**

1. `.factor-helper` (App.tsx:1134 / styles.css:1143) — downsize to 0.7rem, `color: var(--muted)`, wrap in `<em>`.
2. Consistency meter (App.tsx:1117–1128) — add a small legend: "Days with 3+ signals logged".
3. Timeline month scrubber (App.tsx:1207–1217) — add `outline: 2px solid var(--sage)` on `:focus-visible`.
4. EntryList ambient badges (App.tsx:1328–1342) — increase `.entry-source-icon` to 1.2em, add subtle bg dot.
5. InsightCard tone (App.tsx:1348–1357) — add a `::before` badge or 4px left border so colourblind users can distinguish good/watch/neutral.

**Micro-interaction additions:**

1. Quick-action pill (App.tsx:911–937) — add `shippie.feel.texture('light')` on hover, `confirm` on commit.
2. Timeline day expand/collapse — add `transition: max-height 280ms cubic-bezier(0.4,0,0.2,1)`.
3. Insight dismiss button (App.tsx:1355) — add `active:transform scale(0.9)`, 120ms transition.
4. WeekContour path animation on render — `stroke-dashoffset` from 500 to 0 over 1.2s.
5. Pulse-card ring fill animation — animate `--score` from 45 to true value over 600ms when null→number with bounce easing.

**Empty + edge state lifts:**

1. TimelineView empty (App.tsx:1183–1197) — show concrete progress + linked next step.
2. PatternsView insufficient data (App.tsx:1076–1094) — replace abstract copy with progress ring (1/5 signals, 1/3 days).
3. Insight panel no data (App.tsx:957–962) — show a concrete example pattern users could discover.
4. Data wipe confirmation (App.tsx:726–731) — replace `window.confirm()` with a styled sheet showing entry counts.

**Feature lifts:**

1. **Streak detection** — add `streakDays: number` to insights pipeline; surface "7-day streak — consistency is your edge".
2. **Quick-action customization** — let users reorder/hide/add custom quick-actions; persist as `CUSTOM_QUICK_ACTIONS`.
3. **Cross-app insight correlation** — detect "Coffee + mood spike · 45 min apart" patterns.
4. **CSV export for Apple Health** — DataView button to download `chiwit-signals-{YYYYMMDD}.csv`.
5. **Repeat yesterday** — pre-fill check-in form from previous day's values.

**Cleanup:**

1. `UNLOGGED_FACTOR_VALUE = 45` (App.tsx:84) — add a rationale comment.
2. `generateInsights` (App.tsx:415–467) — extract `last7Days` once; reuse.
3. `KIND_META` (line 116) — use CSS variables instead of hardcoded hex.
4. `addDays` duplicated — extract to shared `date-utils.ts`.
5. Entry remove button (App.tsx:1341) — add full aria-label context.

---

## showcase-recipe (Palate)

**Current standout moments:**

- **Pantry-feasibility ranking** (App.tsx:548–580): combines planned + pantry + meal-of-day + personal fit. Hero shows "8/10 ready" so decisions feel transparent.
- **Aisle grouping via regex** (App.tsx:45–50, groupByAisle): shopping list mirrors store layout automatically.
- **CookRecap keepsake canvas** (CookRecap.tsx:60–172): kitchen-tile grid, hero photo fallback, scaled ingredients. Footer `palate/{slug}/v{cookCount}` reads like a notebook entry.

**Hero-moment improvements:**

1. TodayView h1 (App.tsx:1107) — prefix "Tonight: " or shift to current meal slot if not dinner time.
2. TasteBoard "Flavour notes" (App.tsx:1221–1223) — reorder by flavour profile (spices, proteins, veg), limit to 4–5 items.
3. Decision-strip at App.tsx:1121–1125 — add "vs avg 74%" or 3–4 recent recipes' sparkline.
4. Hero status copy (App.tsx:1108–1119) — always show 3-stat breakdown (time · pantry · fit) in `.decision-strip`.
5. CookMode entry — fade-in or slide-up transition; warm cooking-orange bg shift; recipe title font emphasised.

**Information hierarchy fixes:**

1. RecipeTile cook-count (App.tsx:1154) — add `<small>Last cooked: {formatDay(recipe.cookedAt)}</small>`.
2. Ingredient list ordering — group by type (aromatics, proteins, veg, dry, condiments).
3. Shopping-list checked (App.tsx:790) — `.shopping-item.checked { opacity: 0.4; text-decoration: line-through; pointer-events: none; }`.
4. Plan view meal slots (App.tsx:1514–1527) — apply `background: var(--meal-{meal})` per meal type.
5. Pantry expiry chips (App.tsx:1705–1707) — add `🕐` glyph + `background: rgba(255, 0, 0, 0.08)` for expired.

**Micro-interaction additions:**

1. Recipe tile hover — `transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.08);` 160ms.
2. Shopping-list toggle — 200ms flash to sage-soft.
3. CookMode step advance — slide-out left + slide-in right over 280ms.
4. Pantry qty +/- buttons — pulse animation when qty reaches 0 or 1.
5. Search box focus — highlight matching recipes with subtle border.

**Empty + edge state lifts:**

1. CookbookView empty (App.tsx:1296–1305) — concrete prompt about pasting from a blog.
2. Shopping-list empty (App.tsx:1761–1766) — explain Plan → auto-list flow.
3. Plan view empty — show a carousel of "popular tonight" recipes to start.
4. Pantry expired item (App.tsx:1721–1730) — add "Discard {name}" button.
5. Cook-recap post-cook (App.tsx:1010–1012) — "Cook again" button in recap sheet.

**Feature lifts:**

1. **Aisle configuration** — move `SHOP_AISLES` to data file, add Settings UI to reorder/add custom sections.
2. **Recipe photo notes** — extend Ingredient to `{ id, name, qty, unit, photoUrl?, caption? }`.
3. **Meal plan tracking** — "Servings served" counter; week-end "16 meals cooked + 3 leftovers" summary.
4. **Cook-along invite QR in CookMode** — surface entry point for `CookAlong.tsx`.
5. **Recipe import from URL** — extend `recipe-import.ts` with URL → scraper fallback.

**Cleanup:**

1. App.tsx is 2051 lines — extract views into `/src/views/*.tsx`.
2. Utility functions scattered — move to `/src/utils/recipe.ts` and `/src/utils/date.ts`.
3. CookRecapSheet — wire to `KeepsakeRenderer` for consistency with chiwit's WeeklyShape.
4. Metadata maps scattered — consolidate to `/src/constants/metadata.ts`.
5. Recipe state mutation verbose — extract `addRecipe/updateRecipe/removeRecipe` to `/src/state/actions.ts`.
6. Test coverage thin — add unit tests for `scoreForKind`, `parseIngredientLine`, `groupByAisle`.
7. No error boundary for intent failures — wrap intent wiring in try-catch with dev console.warn.

---

## Cross-cutting

- **Keyboard focus management** — reset focus to page `<h1>` after tab change.
- **Locale + timezone detection** — pass `navigator.language` to all date formatters.
- **Intent emission consent** — opt-in modal on first render if app has unseen intents.
