/**
 * Pure shopping-list generator.
 *
 * Diff: planned-recipe ingredients vs. on-hand pantry → returns the
 * items the user still needs to buy. Stays case-insensitive on item
 * names because the recipes app stores titles freely.
 *
 * `computeShoppingListFromPlan` walks the full week, applies portion
 * scaling per slot, and surfaces aggregated quantities when present.
 * Slots without quantities still count toward the "appears in N
 * recipes" tally so the user knows which items are load-bearing.
 */

import { DAYS, SLOTS } from './lib/types.ts';
import type { Plan } from './lib/types.ts';

export interface PlannedRecipeIngredient {
  name: string;
  /** Optional quantity in arbitrary units. */
  quantity?: number;
  unit?: string;
}

export interface PantryItem {
  name: string;
}

export interface ShoppingItem {
  name: string;
  /** How many planned recipes reference this ingredient. */
  count: number;
  /** Aggregated quantity, if every reference carries the same unit. Undefined otherwise. */
  quantity?: number;
  unit?: string;
}

export function computeShoppingList(
  ingredients: readonly PlannedRecipeIngredient[],
  pantry: readonly PantryItem[],
): ShoppingItem[] {
  const onHand = new Set(pantry.map((p) => p.name.trim().toLowerCase()));
  const counts = new Map<
    string,
    { name: string; count: number; quantity?: number; unit?: string; mixedUnit: boolean }
  >();
  for (const ing of ingredients) {
    const name = ing.name.trim();
    const key = name.toLowerCase();
    if (!key || onHand.has(key)) continue;
    const existing = counts.get(key);
    if (!existing) {
      counts.set(key, {
        name,
        count: 1,
        quantity: typeof ing.quantity === 'number' ? ing.quantity : undefined,
        unit: ing.unit,
        mixedUnit: false,
      });
    } else {
      existing.count += 1;
      if (typeof ing.quantity === 'number') {
        if (existing.unit && ing.unit && existing.unit !== ing.unit) {
          existing.mixedUnit = true;
        } else if (!existing.unit && ing.unit) {
          existing.unit = ing.unit;
        }
        existing.quantity = (existing.quantity ?? 0) + ing.quantity;
      }
    }
  }
  return [...counts.values()]
    .map((row) => ({
      name: row.name.toLowerCase(),
      count: row.count,
      ...(row.mixedUnit
        ? {}
        : row.quantity !== undefined
          ? { quantity: row.quantity, ...(row.unit ? { unit: row.unit } : {}) }
          : {}),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Walk a full plan: scale each cell's ingredients by `servings/baseServings`,
 * then compute the diff against pantry. This is what the planner
 * broadcasts on the `shopping-list` intent.
 */
export function computeShoppingListFromPlan(
  plan: Plan,
  pantry: readonly PantryItem[],
): ShoppingItem[] {
  const flat: PlannedRecipeIngredient[] = [];
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const cell = plan[day]?.[slot];
      if (!cell) continue;
      const factor =
        cell.baseServings > 0 ? (cell.servings || cell.baseServings) / cell.baseServings : 1;
      for (const ing of cell.ingredients) {
        flat.push({
          name: ing.name,
          quantity:
            typeof ing.quantity === 'number' && Number.isFinite(ing.quantity)
              ? ing.quantity * factor
              : undefined,
          unit: ing.unit,
        });
      }
    }
  }
  return computeShoppingList(flat, pantry);
}
