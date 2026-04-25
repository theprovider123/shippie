/**
 * Local-DB schema for Recipe Saver.
 *
 * Two tables: recipes + ingredients (one-to-many). All data lives in
 * wa-sqlite + OPFS via @shippie/local-db. Nothing leaves the device
 * unless the user explicitly exports or backs up.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const RECIPES_TABLE = 'recipes';
export const INGREDIENTS_TABLE = 'ingredients';

export const recipesSchema: LocalDbSchema = {
  id: 'text primary key',
  title: 'text not null',
  notes: 'text',
  servings: 'integer',
  cook_minutes: 'integer',
  created_at: 'datetime',
  updated_at: 'datetime',
};

export const ingredientsSchema: LocalDbSchema = {
  id: 'text primary key',
  recipe_id: 'text not null',
  name: 'text not null',
  amount: 'text',
  unit: 'text',
  barcode: 'text',
  brand: 'text',
};

export interface Recipe {
  id: string;
  title: string;
  notes?: string | null;
  servings?: number | null;
  cook_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Ingredient {
  id: string;
  recipe_id: string;
  name: string;
  amount?: string | null;
  unit?: string | null;
  barcode?: string | null;
  brand?: string | null;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: Ingredient[];
}
