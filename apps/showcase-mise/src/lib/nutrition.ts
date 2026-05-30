/**
 * Mise — nutrition math. Pure, side-effect-free, fully unit-tested.
 *
 * The neutral-coaching contract lives here too: progress helpers return
 * descriptive shapes (`reached`, `remaining`, `over`, `headroom`) and
 * never a "failed"/"bad" flag. The UI paints these neutrally — a ceiling
 * being crossed is information, not a verdict.
 */
import type { Food, Nutrients } from './foods-data';
import type { Entry, Slot } from './types';
import { SLOTS } from './foods-data';

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: 0,
  protein_g: 0,
  carb_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sodium_mg: 0,
  caffeine_mg: 0,
  water_ml: 0,
};

const KEYS = Object.keys(EMPTY_NUTRIENTS) as (keyof Nutrients)[];

/** Scale a per-100 g nutrient profile to an arbitrary gram weight. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of KEYS) out[k] = per100[k] * factor;
  return out;
}

/** Nutrients for `qty` servings of a food (qty may be fractional). */
export function nutrientsForServings(food: Food, qty: number): Nutrients {
  return scaleNutrients(food.per100, food.serving.grams * qty);
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of KEYS) out[k] = a[k] + b[k];
  return out;
}

export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  return list.reduce(addNutrients, { ...EMPTY_NUTRIENTS });
}

/** Total nutrients across a set of entries (each carries a snapshot). */
export function totalsForEntries(entries: readonly Entry[]): Nutrients {
  return sumNutrients(entries.map((e) => e.nutrients));
}

/** Round a nutrient profile for display (kcal/sodium/caffeine/water integer; macros 0.1 g). */
export function roundNutrients(n: Nutrients): Nutrients {
  return {
    kcal: Math.round(n.kcal),
    protein_g: round1(n.protein_g),
    carb_g: round1(n.carb_g),
    fat_g: round1(n.fat_g),
    fiber_g: round1(n.fiber_g),
    sodium_mg: Math.round(n.sodium_mg),
    caffeine_mg: Math.round(n.caffeine_mg),
    water_ml: Math.round(n.water_ml),
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export interface MacroBreakdown {
  proteinKcal: number;
  carbKcal: number;
  fatKcal: number;
  /** Percentages of energy from each macro (sum ~100; 0 when no energy). */
  proteinPct: number;
  carbPct: number;
  fatPct: number;
}

/** Energy split using Atwater 4/4/9. Fiber is counted within carbs. */
export function macroBreakdown(n: Nutrients): MacroBreakdown {
  const proteinKcal = n.protein_g * 4;
  const carbKcal = n.carb_g * 4;
  const fatKcal = n.fat_g * 9;
  const total = proteinKcal + carbKcal + fatKcal;
  const pct = (k: number) => (total > 0 ? Math.round((k / total) * 100) : 0);
  return {
    proteinKcal,
    carbKcal,
    fatKcal,
    proteinPct: pct(proteinKcal),
    carbPct: pct(carbKcal),
    fatPct: pct(fatKcal),
  };
}

/** Protein grams logged in each slot. Always returns every slot key. */
export function proteinBySlot(entries: readonly Entry[]): Record<Slot, number> {
  const out = Object.fromEntries(SLOTS.map((s) => [s, 0])) as Record<Slot, number>;
  for (const e of entries) out[e.slot] += e.nutrients.protein_g;
  return out;
}

export interface ProgressToward {
  value: number;
  target: number;
  remaining: number;
  reached: boolean;
  /** 0..(>1). Clamp for display as needed. */
  ratio: number;
}

/** Progress toward a goal you're building up to (energy, protein, fiber, water). */
export function progressToward(value: number, target: number): ProgressToward {
  return {
    value,
    target,
    remaining: Math.max(0, target - value),
    reached: target > 0 ? value >= target : false,
    ratio: target > 0 ? value / target : 0,
  };
}

export interface CeilingProgress {
  value: number;
  ceiling: number;
  headroom: number;
  /** Informational, NOT a failure flag — UI shows this neutrally. */
  over: boolean;
  overBy: number;
  ratio: number;
}

/** Progress against a watch line you'd rather stay under (sodium, caffeine). */
export function withinCeiling(value: number, ceiling: number): CeilingProgress {
  return {
    value,
    ceiling,
    headroom: ceiling - value,
    over: ceiling > 0 ? value > ceiling : false,
    overBy: Math.max(0, value - ceiling),
    ratio: ceiling > 0 ? value / ceiling : 0,
  };
}

/** Local hour-of-day (0–23) for an ISO timestamp. */
export function hourOf(iso: string): number {
  return new Date(iso).getHours();
}

export interface MealTiming {
  count: number;
  /** Hour of first and last intake; null when nothing logged. */
  firstHour: number | null;
  lastHour: number | null;
  /** Eating window in hours (last − first); 0 when ≤1 entry. */
  windowHours: number;
  /** Largest gap in hours between consecutive intakes. */
  largestGapHours: number;
}

/** Describe when food landed across the day. Drinks count as intake. */
export function mealTiming(entries: readonly Entry[]): MealTiming {
  if (entries.length === 0) {
    return { count: 0, firstHour: null, lastHour: null, windowHours: 0, largestGapHours: 0 };
  }
  const times = entries
    .map((e) => new Date(e.logged_at).getTime())
    .sort((a, b) => a - b);
  const first = times[0]!;
  const last = times[times.length - 1]!;
  let largestGap = 0;
  for (let i = 1; i < times.length; i++) {
    largestGap = Math.max(largestGap, times[i]! - times[i - 1]!);
  }
  return {
    count: entries.length,
    firstHour: new Date(first).getHours(),
    lastHour: new Date(last).getHours(),
    windowHours: round1((last - first) / 3_600_000),
    largestGapHours: round1(largestGap / 3_600_000),
  };
}
