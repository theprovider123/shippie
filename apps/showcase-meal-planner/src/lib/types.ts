/**
 * Domain types shared across the meal planner.
 *
 * Kept narrow on purpose — the recipe payload that arrives from the
 * Recipe app via the transfer API is the source of truth for nutrition
 * and cost. Anything missing falls back to a per-meal default; we never
 * fabricate macros.
 */

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const SLOTS = ['Breakfast', 'Lunch', 'Dinner'] as const;

export type Day = (typeof DAYS)[number];
export type Slot = (typeof SLOTS)[number];

/** A single ingredient on a planned recipe. Quantity is optional because most recipes are vague. */
export interface RecipeIngredient {
  name: string;
  quantity?: number;
  unit?: string;
}

/** Per-serving nutrition. All grams except calories (kcal). */
export interface NutritionPerServing {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

/** Filled meal-plan slot. */
export interface PlanCell {
  recipeName: string;
  ingredients: RecipeIngredient[];
  /** Servings the user is cooking for this slot (>=1). Defaults to baseServings. */
  servings: number;
  /** Servings the recipe assumes per its source (yields). */
  baseServings: number;
  /** Nutrition per serving, if the source provided it. */
  nutrition?: NutritionPerServing;
  /** Estimated cost per serving in user's local currency. */
  costPerServing?: number;
  /** Whether this slot has been marked cooked. */
  cooked?: boolean;
}

export type Plan = Partial<Record<Day, Partial<Record<Slot, PlanCell>>>>;

export interface CookedMealRow {
  recipeId?: string;
  title: string;
  cookedAt: string;
  ingredients?: string[];
}

/** Surplus from a cooked meal — sent on the `leftover-available` intent. */
export interface LeftoverRow {
  /** Stable id so consumers can dedupe across rebroadcasts. */
  id: string;
  recipeName: string;
  servings: number;
  cookedAt: string;
  /** ISO date — eat by this day. Default: cookedAt + 3 days. */
  eatBy: string;
}
