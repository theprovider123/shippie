/**
 * Portion scaling — straightforward kitchen math.
 *
 * Given a recipe with `baseServings` ingredients and a desired
 * `targetServings`, return the ingredients with quantities scaled by
 * `target/base`. Ingredients without a quantity pass through (the user
 * eyeballs salt regardless of the multiplier).
 *
 * We purposefully don't round — an HTML input set to `step="0.25"`
 * keeps quantities reasonable. A view-layer `formatQuantity` rounds for
 * display, never for storage.
 */

import type { NutritionPerServing, RecipeIngredient } from './types.ts';

export function scaleIngredients(
  ingredients: readonly RecipeIngredient[],
  baseServings: number,
  targetServings: number,
): RecipeIngredient[] {
  if (baseServings <= 0 || targetServings <= 0) return ingredients.map((i) => ({ ...i }));
  const factor = targetServings / baseServings;
  return ingredients.map((ing) => {
    if (typeof ing.quantity !== 'number' || !Number.isFinite(ing.quantity)) {
      return { ...ing };
    }
    return { ...ing, quantity: ing.quantity * factor };
  });
}

/**
 * Nutrition is stored per-serving by convention so it doesn't scale
 * with portion changes — what scales is the *total* you eat. This
 * helper returns the meal total for a slot.
 */
export function scaleNutritionTotal(
  perServing: NutritionPerServing,
  servings: number,
): NutritionPerServing {
  const s = Math.max(0, servings);
  return {
    calories: perServing.calories * s,
    protein: perServing.protein * s,
    carbs: perServing.carbs * s,
    fat: perServing.fat * s,
    fibre: perServing.fibre * s,
  };
}

/**
 * Display helper — rounds to a clean kitchen number. Whole numbers
 * stay whole, otherwise we keep a single fractional digit. Tiny values
 * (<0.1) get two digits so spice quantities aren't misread as zero.
 */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return '';
  if (Math.abs(qty - Math.round(qty)) < 0.05) return String(Math.round(qty));
  if (Math.abs(qty) < 0.1) return qty.toFixed(2);
  return qty.toFixed(1);
}
