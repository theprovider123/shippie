/**
 * Canonical recipe presets — the starting points a baker can pick
 * from on first launch. Each preset declares the full RecipeSpec
 * (flour mix + hydration + salt + leaven %) plus a stage list that
 * already reflects the right cadence for sourdough vs commercial yeast.
 *
 * Custom recipes saved by the user share the same Recipe shape and
 * live in the `customRecipes` table — see db.ts.
 */

import {
  type FlourPart,
  type LeavenKind,
  type RecipeSpec,
  computeWeights,
  type DoughWeights,
} from './lib/percentages.ts';
import {
  type Stage,
  defaultStages,
  totalMinutes,
  planFromReady,
  planFromStart,
  type PlannedSchedule,
} from './lib/schedule.ts';

export type Mode = 'sourdough' | 'yeast';

/**
 * "Sourdough mode" if the leaven is a wild starter. Everything else
 * (instant, fresh, poolish) is treated as commercial yeast for the
 * purposes of mode-switched UI (no starter-feed gate, shorter bulk
 * default, no cold retard by default).
 */
export function modeForLeaven(leaven: LeavenKind): Mode {
  return leaven === 'sourdough' ? 'sourdough' : 'yeast';
}

export interface Recipe extends RecipeSpec {
  id: string;
  name: string;
  description: string;
  /** Default total dough weight in grams. */
  defaultTotalG: number;
  /** Stages — already adapted for sourdough vs yeast cadence. */
  stages: ReadonlyArray<Stage>;
  /** Tag flag for the home grid. */
  preset: boolean;
  /** When user-saved, the create timestamp. Presets leave this undefined. */
  createdAt?: string;
}

const SOURDOUGH_BOULE_FLOURS: FlourPart[] = [
  { kind: 'bread', pct: 80 },
  { kind: 'whole-wheat', pct: 20 },
];

const COUNTRY_LOAF_FLOURS: FlourPart[] = [
  { kind: 'bread', pct: 70 },
  { kind: 'whole-wheat', pct: 20 },
  { kind: 'rye', pct: 10 },
];

const RYE_LOAF_FLOURS: FlourPart[] = [
  { kind: 'rye', pct: 70 },
  { kind: 'bread', pct: 30 },
];

const FOCACCIA_FLOURS: FlourPart[] = [
  { kind: 'bread', pct: 100 },
];

const NAPOLETANA_FLOURS: FlourPart[] = [
  { kind: '00', pct: 100 },
];

const NY_PIZZA_FLOURS: FlourPart[] = [
  { kind: 'bread', pct: 100 },
];

const POOLISH_BAGUETTE_FLOURS: FlourPart[] = [
  { kind: 'bread', pct: 100 },
];

const BRIOCHE_FLOURS: FlourPart[] = [
  { kind: 'all-purpose', pct: 100 },
];

function preset(args: {
  id: string;
  name: string;
  description: string;
  flours: ReadonlyArray<FlourPart>;
  hydration: number;
  salt: number;
  leaven: LeavenKind;
  leavenPct: number;
  defaultTotalG: number;
  stages: ReadonlyArray<Stage>;
}): Recipe {
  return { ...args, preset: true };
}

export const RECIPES: ReadonlyArray<Recipe> = [
  preset({
    id: 'sourdough-country',
    name: 'Country sourdough',
    description: '78% hydration · bread + whole-wheat + rye · 12h cold retard.',
    flours: COUNTRY_LOAF_FLOURS,
    hydration: 78,
    salt: 2,
    leaven: 'sourdough',
    leavenPct: 20,
    defaultTotalG: 900,
    stages: defaultStages({
      leaven: 'sourdough',
      bulkHours: 4,
      coldRetardMinutes: 12 * 60,
    }),
  }),
  preset({
    id: 'sourdough-boule',
    name: 'Sourdough boule',
    description: '76% hydration · 20% whole-wheat · classic open crumb.',
    flours: SOURDOUGH_BOULE_FLOURS,
    hydration: 76,
    salt: 2,
    leaven: 'sourdough',
    leavenPct: 20,
    defaultTotalG: 900,
    stages: defaultStages({
      leaven: 'sourdough',
      bulkHours: 4,
      coldRetardMinutes: 12 * 60,
    }),
  }),
  preset({
    id: 'rye-loaf',
    name: 'Rye loaf',
    description: '75% hydration · 70% rye · tight crumb · sour tang.',
    flours: RYE_LOAF_FLOURS,
    hydration: 75,
    salt: 1.8,
    leaven: 'sourdough',
    leavenPct: 25,
    defaultTotalG: 850,
    stages: defaultStages({
      leaven: 'sourdough',
      bulkHours: 3,
      coldRetardMinutes: 8 * 60,
      bakeMinutes: 50,
    }),
  }),
  preset({
    id: 'focaccia',
    name: 'Focaccia',
    description: '80% hydration · big bubbles · dimpled and oily.',
    flours: FOCACCIA_FLOURS,
    hydration: 80,
    salt: 2.2,
    leaven: 'instant-yeast',
    leavenPct: 0.8,
    defaultTotalG: 1000,
    stages: defaultStages({
      leaven: 'instant-yeast',
      bulkHours: 4,
      useColdRetard: true,
      coldRetardMinutes: 12 * 60,
      bakeMinutes: 25,
    }),
  }),
  preset({
    id: 'pizza-napoletana',
    name: 'Pizza Napoletana',
    description: '60% hydration · 24h cold proof · "00" flour.',
    flours: NAPOLETANA_FLOURS,
    hydration: 60,
    salt: 2.8,
    leaven: 'fresh-yeast',
    leavenPct: 0.1,
    defaultTotalG: 1000,
    stages: defaultStages({
      leaven: 'fresh-yeast',
      bulkHours: 1.5,
      useColdRetard: true,
      coldRetardMinutes: 24 * 60,
      bakeMinutes: 90, // ~90 seconds per pie, repeated, but keep schedule honest at "oven up + 1h cooks"
    }),
  }),
  preset({
    id: 'pizza-ny',
    name: 'Pizza, NY-style',
    description: '64% hydration · oil + sugar · floppy chew.',
    flours: NY_PIZZA_FLOURS,
    hydration: 64,
    salt: 2.5,
    leaven: 'instant-yeast',
    leavenPct: 0.4,
    defaultTotalG: 850,
    stages: defaultStages({
      leaven: 'instant-yeast',
      bulkHours: 1,
      useColdRetard: true,
      coldRetardMinutes: 24 * 60,
      bakeMinutes: 60,
    }),
  }),
  preset({
    id: 'poolish-baguette',
    name: 'Poolish baguette',
    description: '70% hydration · overnight poolish · open crumb.',
    flours: POOLISH_BAGUETTE_FLOURS,
    hydration: 70,
    salt: 2,
    leaven: 'poolish',
    leavenPct: 30,
    defaultTotalG: 1400,
    stages: defaultStages({
      leaven: 'poolish',
      bulkHours: 1.5,
      preFermentMinutes: 12 * 60,
      bakeMinutes: 25,
    }),
  }),
  preset({
    id: 'brioche',
    name: 'Brioche',
    description: '50% hydration · enriched · long mix to silk.',
    flours: BRIOCHE_FLOURS,
    hydration: 50,
    salt: 1.5,
    leaven: 'instant-yeast',
    leavenPct: 1,
    defaultTotalG: 480,
    stages: defaultStages({
      leaven: 'instant-yeast',
      bulkHours: 1,
      useColdRetard: true,
      coldRetardMinutes: 12 * 60,
      bakeMinutes: 30,
    }),
  }),
];

/** Re-export of the math kernel for callers that already imported from recipes. */
export { computeWeights, planFromReady, planFromStart, totalMinutes };
export type { DoughWeights, PlannedSchedule, Stage, RecipeSpec, FlourPart, LeavenKind };

/**
 * Backwards-compat for the old top-level `compute(recipe, balls, ballG)`
 * API. Only kept for the existing test, which we're rewriting anyway.
 */
export function compute(recipe: Recipe, balls: number, ballG: number): DoughWeights {
  return computeWeights(recipe, balls * ballG);
}
