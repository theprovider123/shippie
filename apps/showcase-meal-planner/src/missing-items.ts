/**
 * Pure shopping-list generator.
 *
 * Diff: planned-recipe ingredients vs. on-hand pantry → returns the
 * items the user still needs to buy. Stays case-insensitive on item
 * names because the recipes app stores titles freely.
 */

export interface PlannedRecipeIngredient {
  name: string;
  /** Optional quantity in arbitrary units; we just track names for the demo. */
  quantity?: number;
}

export interface PantryItem {
  name: string;
}

export interface ShoppingItem {
  name: string;
  /** How many planned recipes reference this ingredient. */
  count: number;
}

export function computeShoppingList(
  ingredients: readonly PlannedRecipeIngredient[],
  pantry: readonly PantryItem[],
): ShoppingItem[] {
  const onHand = new Set(pantry.map((p) => p.name.trim().toLowerCase()));
  const counts = new Map<string, number>();
  for (const ing of ingredients) {
    const key = ing.name.trim().toLowerCase();
    if (!key || onHand.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
