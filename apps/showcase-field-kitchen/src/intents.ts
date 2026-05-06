/**
 * The seven intents Field Kitchen broadcasts. The cross-app graph
 * (Daily Briefing, Sleep Logger, Habit Tracker, Restaurant Memory,
 * Journal, etc.) consumes them — keep the names verbatim.
 *
 *   - coffee-brewed         (Brew: when "I just brewed" fires)
 *   - caffeine-logged       (Brew: also fires from "I just brewed";
 *                            Hydrate fires it from coffee/tea logs)
 *   - dough-ferment-started (Bake: "Started fermenting")
 *   - dough-ready           (Bake: "Bread ready")
 *   - cooking-now           (Cook: "Cooking now")
 *   - cooked-meal           (Cook: "Cooked meal")
 *   - hydration-logged      (Hydrate: any drink log)
 *
 * Payloads are intentionally small and JSON-friendly. Consumers
 * should treat unknown fields as ignorable.
 */

import type { CookMethod, DrinkKind } from './db/schema.ts';

export type IntentName =
  | 'coffee-brewed'
  | 'caffeine-logged'
  | 'dough-ferment-started'
  | 'dough-ready'
  | 'cooking-now'
  | 'cooked-meal'
  | 'hydration-logged';

export interface CoffeeBrewedPayload {
  ratio: number;
  water_g: number;
  coffee_g: number;
  bean_name?: string | null;
  brewed_at: string;
}

export interface CaffeineLoggedPayload {
  kind: 'coffee' | 'tea' | 'espresso';
  /** Approximate caffeine, mg. Optional — consumers can ignore. */
  mg?: number;
  logged_at: string;
}

export interface DoughFermentStartedPayload {
  flour_g: number;
  hydration: number;
  cold_hours: number;
  started_at: string;
  ready_at: string;
}

export interface DoughReadyPayload {
  ready_at: string;
}

export interface CookingNowPayload {
  method: CookMethod;
  label?: string | null;
  started_at: string;
}

export interface CookedMealPayload {
  method: CookMethod;
  label?: string | null;
  cooked_at: string;
}

export interface HydrationPayload {
  kind: DrinkKind;
  logged_at: string;
}

/**
 * Approximate caffeine per 250ml drink. Tea+coffee are blunt
 * averages; consumers shouldn't treat these as accurate, but they
 * give Sleep Logger something to correlate against.
 */
export const APPROX_CAFFEINE_MG: Record<'coffee' | 'tea' | 'espresso', number> = {
  coffee: 95,
  tea: 47,
  espresso: 63,
};
