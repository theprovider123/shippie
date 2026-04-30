/**
 * Recipe-specific share helpers.
 *
 * The payload we put into a ShareBlob is a subset of RecipeWithIngredients
 * (no IDs, no internal timestamps — they're meaningless on the receiving
 * device and recipients should get fresh ones on import).
 */
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  type ShareBlob,
} from '@shippie/share';
import type { Ingredient, RecipeWithIngredients } from '../db/schema.ts';

export const RECIPE_SHARE_TYPE = 'recipe';

export interface RecipeSharePayload {
  title: string;
  notes?: string | null;
  servings?: number | null;
  cook_minutes?: number | null;
  ingredients: Array<{
    name: string;
    amount?: string | null;
    unit?: string | null;
    barcode?: string | null;
    brand?: string | null;
  }>;
}

export function recipeToPayload(recipe: RecipeWithIngredients): RecipeSharePayload {
  return {
    title: recipe.title,
    notes: recipe.notes ?? null,
    servings: recipe.servings ?? null,
    cook_minutes: recipe.cook_minutes ?? null,
    ingredients: recipe.ingredients.map((i: Ingredient) => ({
      name: i.name,
      amount: i.amount ?? null,
      unit: i.unit ?? null,
      barcode: i.barcode ?? null,
      brand: i.brand ?? null,
    })),
  };
}

export async function buildRecipeShare(
  recipe: RecipeWithIngredients,
  baseUrl: string = typeof window !== 'undefined' ? window.location.origin + '/' : '/',
): Promise<{ blob: ShareBlob<RecipeSharePayload>; url: string }> {
  const payload = recipeToPayload(recipe);
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<RecipeSharePayload>({
    type: RECIPE_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob: blob as ShareBlob<RecipeSharePayload>, url };
}
