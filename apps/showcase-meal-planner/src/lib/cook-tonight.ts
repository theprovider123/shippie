/**
 * Cook-from-current-pantry ranking.
 *
 * Cross-references a candidate pool (recipes the user has touched —
 * recently cooked or already on this week's plan) against the live
 * pantry inventory. Ranks by fewest missing ingredients, then by
 * shortest title for stable ordering.
 *
 * Honest with the user: each row carries `missing` *and* `have` so the
 * UI can show "you've got 5 of 6 — short the bread" and not just a
 * gold-star score.
 */

import type { CookedMealRow, Plan, PlanCell, RecipeIngredient } from './types.ts';
import { DAYS, SLOTS } from './types.ts';

export interface CookTonightCandidate {
  recipeName: string;
  ingredients: RecipeIngredient[];
  /** Where this candidate came from — for the "why is this here?" hover. */
  source: 'planned' | 'cooked';
  /** ISO timestamp for sort stability when a recipe is in both pools. */
  hint?: string;
}

export interface CookTonightRow {
  recipeName: string;
  ingredients: RecipeIngredient[];
  have: string[];
  missing: string[];
  source: 'planned' | 'cooked';
}

function normalise(s: string): string {
  return s.trim().toLowerCase();
}

export function gatherCandidates(
  plan: Plan,
  cookedHistory: readonly CookedMealRow[],
): CookTonightCandidate[] {
  const seen = new Map<string, CookTonightCandidate>();

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const cell = plan[day]?.[slot];
      if (!cell) continue;
      const key = normalise(cell.recipeName);
      if (!seen.has(key)) {
        seen.set(key, {
          recipeName: cell.recipeName,
          ingredients: cell.ingredients,
          source: 'planned',
        });
      }
    }
  }

  for (const row of cookedHistory) {
    const key = normalise(row.title);
    if (seen.has(key)) continue;
    const ingredients: RecipeIngredient[] =
      row.ingredients?.map((name) => ({ name })) ?? [];
    seen.set(key, {
      recipeName: row.title,
      ingredients,
      source: 'cooked',
      hint: row.cookedAt,
    });
  }

  return [...seen.values()];
}

export function rankCookTonight(
  candidates: readonly CookTonightCandidate[],
  pantry: readonly { name: string }[],
): CookTonightRow[] {
  const onHand = new Set(pantry.map((p) => normalise(p.name)));
  const rows: CookTonightRow[] = [];
  for (const c of candidates) {
    const have: string[] = [];
    const missing: string[] = [];
    for (const ing of c.ingredients) {
      const key = normalise(ing.name);
      if (!key) continue;
      if (onHand.has(key)) have.push(ing.name);
      else missing.push(ing.name);
    }
    rows.push({
      recipeName: c.recipeName,
      ingredients: c.ingredients,
      have,
      missing,
      source: c.source,
    });
  }
  rows.sort((a, b) => {
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    if (b.have.length !== a.have.length) return b.have.length - a.have.length;
    return a.recipeName.localeCompare(b.recipeName);
  });
  return rows;
}

export function cookTonightFromPlan(
  plan: Plan,
  cookedHistory: readonly CookedMealRow[],
  pantry: readonly { name: string }[],
): CookTonightRow[] {
  return rankCookTonight(gatherCandidates(plan, cookedHistory), pantry);
}

/** Helper used by the page to materialise a chosen row into a plan cell. */
export function cellFromCandidate(row: CookTonightRow, baseServings = 2): PlanCell {
  return {
    recipeName: row.recipeName,
    ingredients: row.ingredients,
    servings: baseServings,
    baseServings,
  };
}
