/**
 * Weekly nutrition rollup.
 *
 * Honest math: sum the per-serving nutrition × servings for every
 * filled slot. Empty slots contribute nothing. We don't average across
 * the week — we sum, because someone planning Mon–Wed and freezing
 * Thu–Sun should see the three-day total, not a misleading "weekly
 * average" that suggests 7 days of eating.
 *
 * If a recipe has no nutrition data attached, that slot is skipped and
 * also flagged in `untrackedSlots` so the UI can surface the blind spot
 * honestly. No fabrication.
 */

import { DAYS, SLOTS } from './types.ts';
import type { Day, NutritionPerServing, Plan } from './types.ts';

export interface DayTotals {
  day: Day;
  totals: NutritionPerServing;
  /** How many slots on this day had nutrition we could include. */
  trackedSlots: number;
  /** How many slots on this day were filled but had no nutrition. */
  untrackedSlots: number;
}

export interface WeekRollup {
  byDay: DayTotals[];
  weekTotals: NutritionPerServing;
  trackedSlots: number;
  untrackedSlots: number;
}

const ZERO: NutritionPerServing = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fibre: 0,
};

function add(a: NutritionPerServing, b: NutritionPerServing): NutritionPerServing {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fibre: a.fibre + b.fibre,
  };
}

export function rollupWeek(plan: Plan): WeekRollup {
  const byDay: DayTotals[] = [];
  let weekTotals: NutritionPerServing = { ...ZERO };
  let trackedSlots = 0;
  let untrackedSlots = 0;

  for (const day of DAYS) {
    let dayTotals: NutritionPerServing = { ...ZERO };
    let dayTracked = 0;
    let dayUntracked = 0;
    for (const slot of SLOTS) {
      const cell = plan[day]?.[slot];
      if (!cell) continue;
      if (!cell.nutrition) {
        dayUntracked += 1;
        continue;
      }
      const servings = Math.max(0, cell.servings || 0);
      dayTotals = add(dayTotals, {
        calories: cell.nutrition.calories * servings,
        protein: cell.nutrition.protein * servings,
        carbs: cell.nutrition.carbs * servings,
        fat: cell.nutrition.fat * servings,
        fibre: cell.nutrition.fibre * servings,
      });
      dayTracked += 1;
    }
    byDay.push({ day, totals: dayTotals, trackedSlots: dayTracked, untrackedSlots: dayUntracked });
    weekTotals = add(weekTotals, dayTotals);
    trackedSlots += dayTracked;
    untrackedSlots += dayUntracked;
  }

  return { byDay, weekTotals, trackedSlots, untrackedSlots };
}

/** Round a number for display — calories whole, macros to nearest gram. */
export function roundDisplay(n: number, kind: 'kcal' | 'g'): number {
  if (kind === 'kcal') return Math.round(n);
  return Math.round(n);
}
