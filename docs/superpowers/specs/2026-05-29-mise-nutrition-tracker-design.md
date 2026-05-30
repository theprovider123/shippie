# Mise — a nutrition tracker people keep using

**Date:** 2026-05-29
**Slug:** `mise` · **Dir:** `apps/showcase-mise/` · **Port:** 5255
**Status:** design of record for the build kicked off by `/goal`.

## Why this app, and why a new one

No existing Shippie showcase is a food/nutrition **log**. The food cluster
covers planning and inventory — Palate (recipes/cooking/meal-plan/pantry),
Meal Planner, Pantry Scanner, Shopping List, Restaurant Memory — and Sip Log
covers only hydration/caffeine. None of them answer "what did I actually eat,
and is it adding up the way I want?" Mise fills that gap and **consumes** the
cluster's signals (`cooked-meal`, `meal-planned`, `pantry-inventory`,
`shopping-list`) so logging a real meal is one tap, not a re-entry.

### The core thesis (from the research)

~80% of people quit food logging apps within weeks, and the cause is
**friction, not motivation** — when a meal takes two minutes to log, people
defer, batch, and stop. So speed of logging *is* the product. Every design
decision below is graded against "did this remove a tap?" Insights are the
second pull, but they only exist because logging stuck.

## Brand

Distinct from Palate (warm orange kitchen), Chiwit (coral wellness), Cycle
(dusty rose), Lift (rust strength). Mise — from *mise en place*, "everything
in its place" — reads precise, food-literate, and prep-minded without any
diet-culture or calorie-counting baggage.

- **Accent:** plum/aubergine `#6E4A6B` — produce-toned (fig, plum, beet),
  editorial, precise. Deliberately **not** wellness-green, not diet-red.
- **Base:** warm oat-paper light mode (`--cream-*` tokens), Fraunces display,
  JetBrains Mono for all numerics (grams read like a recipe card, not a scale
  readout). Data-rich, never punitive.
- **Macro swatches:** four muted, equal-weight hues (protein/carb/fat/fiber).
  No food is "good" or "bad"; no red over-limit state.

## Modes (target presets, all editable)

`muscle-gain`, `fat-loss`, `maintenance`, `endurance`, `cycle-aware`,
`general-energy`, `sodium-watch`, `fiber-watch`, `protein-watch`. A mode seeds
neutral daily targets (energy, protein/carb/fat split, fiber, sodium ceiling,
water, protein-per-meal, caffeine cutoff) — protein scaled to bodyweight when
known. Switching mode broadcasts `macro-target-updated`. Targets are
*reference lines*, not pass/fail.

## Neutral coaching contract

- No red failure states, no shame copy, no "you blew it."
- Over a watch line (sodium/caffeine) shows informatively in neutral tone with
  the trend, never as a failure.
- "Regularity" and "protein spread" are described, not scored. No streak
  pressure framed as loss (no "don't break your streak"). Reaching a target is
  a quiet ✓, dismissible.

## Surfaces (4 tabs)

1. **Today** — the log. A compact **data band** (energy · protein · carb · fat
   · fiber · sodium · water · caffeine) showing reached/remaining neutrally.
   **Quick-add** row: Recents, Favorites, Saved meals, **Copy yesterday**,
   free-text parse, rough portions, plus **import chips** when a `cooked-meal`
   / `meal-planned` arrives. A **meal timeline** groups today's entries by slot
   (breakfast/lunch/dinner/snack/drink) with times → makes protein
   distribution and meal timing visible.
2. **Foods** — fuzzy search over the seeded offline DB + user-created foods;
   create-custom-food; favorites; saved meals (combos).
3. **Patterns** — neutral insight cards: protein gaps & spread, hydration/
   caffeine timing, workout fueling (from `workout-completed`), cycle-phase
   notes (from `cycle-logged`), meal regularity, sodium/fiber trends, energy/
   satiety notes (from `mood-logged`). 7-day rollups.
4. **Settings** — mode, editable targets, bodyweight (auto-filled from
   `body-metrics-logged` with consent), units, export/import JSON, "Your Data"
   panel, optional online-enrichment endpoint (off by default), disclaimer.

## Data model (localStorage `shippie.mise.v1`, local is canonical)

- `foods` — custom foods: `{id, name, brand?, per100:{kcal,protein_g,carb_g,
  fat_g,fiber_g,sodium_mg,caffeine_mg,water_ml}, serving:{label,grams},
  source:'custom', tags[], favorite}`. Seeded foods live in a static module
  (`foods-data.ts`), not storage.
- `entries` — the log: `{id, foodId?, name, slot, qty, grams, nutrients
  (snapshot), logged_at, note?}`. Snapshot makes entries immune to later food
  edits. Pruned > 365 days.
- `meals` — saved combos: `{id, name, items:[{foodId,qty}], favorite}`.
- `goals` — `{mode, bodyweightKg?, units, targets:{...}, customized}`.
- `external` — last-seen cached payloads from consumed intents (for import
  chips + insights). Bounded.

## Intents

**Provides** (broadcast via `shippie.intent.broadcast`):
- `nutrition-logged` — every entry: `{kcal,protein_g,carb_g,fat_g,fiber_g,
  sodium_mg,slot,logged_at}`
- `meal-logged` — logging a saved meal / whole slot: `{name,slot,kcal,
  protein_g,items,logged_at}`
- `protein-target-hit` — once/day when daily protein ≥ target: `{protein_g,
  target_g,date}`
- `hydration-logged` — water entries: `{ml,logged_at}`
- `caffeine-logged` — caffeine entries: `{mg,logged_at}`
- `macro-target-updated` — mode/target change: `{mode,kcal,protein_g,...}`

`nutrition-logged`, `meal-logged`, `protein-target-hit`, `macro-target-updated`
have no in-tree consumer yet → add to `ALLOWED_ORPHAN_PROVIDERS` in
`intent-graph.test.ts`. `hydration-logged`/`caffeine-logged` already have
consumers (Chiwit).

**Consumes** (`subscribe` + `requestIntent` on mount):
`cooked-meal`, `meal-planned`, `shopping-list`, `pantry-inventory`,
`workout-completed`, `cycle-logged`, `body-metrics-logged`, `mood-logged`.
All have providers (Palate provides `cooked-meal` + `meal-planned`; consuming
them also helps the heavy-hitter "≥2 consumers" thesis for `cooked-meal`,
`workout-completed`, `mood-logged`).

## Offline + enrichment

Core logging works fully offline after first load. ~140 seeded common foods
(per-100g + a sensible default serving) ship in `foods-data.ts`. Optional
online enrichment is a guarded stub: **off by default** (no endpoint set →
never touches the network), returns `null` when disabled or on any failure, so
the app degrades cleanly to the local DB. No account required.

## Modules (isolation-first)

`lib/foods-data.ts` (seed DB + types) · `lib/nutrition.ts` (scaling, totals,
macro breakdown, protein distribution, meal timing, neutral target progress) ·
`lib/modes.ts` (mode → target generation) · `lib/search.ts` (fuzzy search +
free-text/portion parse) · `lib/store.ts` (persist, normalise, copy-yesterday,
export) · `lib/insights.ts` (neutral cards) · `lib/intents.ts` (pure mappers
entry→rows, meal→rows, cooked-meal→entry, external→suggestion) · `lib/enrich.ts`
(optional, off by default). Components & pages stay thin and prop-driven.

## Tests (bun:test, colocated)

Nutrition math (scaling, totals, macro %, protein-per-slot, neutral progress
incl. over-target staying non-failure), food search (fuzzy + free-text parse +
rough portions), meal copy (copy-yesterday clones with fresh ids/timestamps),
imports (cooked-meal→entry, meal-planned mapping, portion mapping),
persistence/export (round-trip + normalise + export shape), intent matching
(broadcast payload shapes + external-intent→suggestion mapping).

## Registration

- `apps/showcase-mise/shippie.json` — full manifest (intents, curation
  `{surface:'featured', category:'health-fitness'}`, data_passport `mise.v1`).
- `state.ts` `curatedAppSpecs` — append entry (slug/name/short/desc/appKind
  'local'/icon 'MI'/accent/category/port 5255/intents). **Hand-edited** — the
  `new:showcase` generator is stale (targets an old array shape) and would
  corrupt `state.ts`.
- `intent-graph.test.ts` — whitelist the 4 novel providers.
- `drizzle/0043_seed_showcase_mise.sql` — marketplace seed row (matches the
  generator's pattern so `/apps` lists it).

## Verification

`bun run typecheck && bun run test && bun run build` green; dev-load the app at
`/run/mise` and confirm desktop + mobile (≤480px) + offline (reload with
network off) logging works.
