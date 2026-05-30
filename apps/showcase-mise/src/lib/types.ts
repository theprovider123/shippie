/**
 * Mise — shared domain types.
 *
 * Kept in their own module so the math (nutrition.ts), persistence
 * (store.ts), intent mappers (intents.ts) and insights (insights.ts)
 * can all depend on the shapes without depending on each other.
 */
import type { Nutrients, Slot } from './foods-data';

export type EntrySource =
  | 'quick'
  | 'search'
  | 'free-text'
  | 'meal'
  | 'import'
  | 'copy';

export interface Entry {
  id: string;
  /** seed_/custom_ food id, or absent for free-text & inline imports. */
  foodId?: string;
  name: string;
  slot: Slot;
  /** Number of servings (informational; grams is canonical for math). */
  qty: number;
  /** Resolved grams this entry represents. */
  grams: number;
  /** Nutrient snapshot already scaled to `grams` — immune to later food edits. */
  nutrients: Nutrients;
  /** ISO timestamp. */
  logged_at: string;
  note?: string;
  source?: EntrySource;
}

export interface MealItem {
  foodId: string;
  qty: number;
}

export interface Meal {
  id: string;
  name: string;
  items: MealItem[];
  favorite?: boolean;
  createdAt: string;
}

export type Mode =
  | 'maintenance'
  | 'muscle-gain'
  | 'fat-loss'
  | 'endurance'
  | 'cycle-aware'
  | 'general-energy'
  | 'sodium-watch'
  | 'fiber-watch'
  | 'protein-watch';

export type Units = 'metric' | 'imperial';

export interface Targets {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
  /** Sodium watch line (ceiling), mg. */
  sodium_mg: number;
  /** Daily hydration goal, ml. */
  water_ml: number;
  /** Caffeine watch line (ceiling), mg. */
  caffeine_mg: number;
  /** Hour (0–23) after which caffeine reads as a sleep risk. */
  caffeine_cutoff_hour: number;
  /** Per-meal protein the mode would like to see spread across the day. */
  protein_per_meal_g: number;
}

export interface Goals {
  mode: Mode;
  bodyweightKg?: number;
  units: Units;
  targets: Targets;
  /** True once the user edits a target away from the mode preset. */
  customized: boolean;
}

export { type Nutrients, type Slot } from './foods-data';
