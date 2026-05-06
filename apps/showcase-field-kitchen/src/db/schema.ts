/**
 * Local-DB schema for Field Kitchen.
 *
 * Five tables, one per mode + a shared bean library:
 *   - beans            (Brew: bean library)
 *   - brews            (Brew: each completed brew)
 *   - dough_schedules  (Bake: each generated/saved schedule)
 *   - meals            (Cook: each cooked meal)
 *   - drinks           (Hydrate: each one-tap drink log)
 *
 * Everything runs on @shippie/local-db (wa-sqlite + OPFS) in production
 * with an in-memory fallback for dev/standalone. No network calls.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const BEANS_TABLE = 'beans';
export const BREWS_TABLE = 'brews';
export const DOUGH_SCHEDULES_TABLE = 'dough_schedules';
export const MEALS_TABLE = 'meals';
export const DRINKS_TABLE = 'drinks';

export const beansSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  roast_date: 'text',
  origin: 'text',
  notes: 'text',
};

export const brewsSchema: LocalDbSchema = {
  id: 'text primary key',
  ratio: 'real',
  water_g: 'real',
  coffee_g: 'real',
  bean_id: 'text',
  bean_name: 'text',
  brewed_at: 'datetime',
};

export const doughSchedulesSchema: LocalDbSchema = {
  id: 'text primary key',
  hydration: 'real',
  salt_pct: 'real',
  leaven_pct: 'real',
  flour_g: 'real',
  cold_hours: 'real',
  started_at: 'datetime',
  ready_at: 'datetime',
};

export const mealsSchema: LocalDbSchema = {
  id: 'text primary key',
  method: 'text not null',
  internal_temp: 'real',
  started_at: 'datetime',
  ended_at: 'datetime',
  label: 'text',
};

export const drinksSchema: LocalDbSchema = {
  id: 'text primary key',
  kind: 'text not null',
  logged_at: 'datetime',
};

export type DrinkKind = 'water' | 'coffee' | 'tea' | 'herbal' | 'other';
export type CookMethod = 'sous-vide' | 'smoking' | 'roasting' | 'pan';

export const DRINK_KINDS: DrinkKind[] = ['water', 'coffee', 'tea', 'herbal', 'other'];
export const COOK_METHODS: CookMethod[] = ['sous-vide', 'smoking', 'roasting', 'pan'];

export const COOK_METHOD_LABEL: Record<CookMethod, string> = {
  'sous-vide': 'Sous vide',
  smoking: 'Smoking',
  roasting: 'Roasting',
  pan: 'Pan',
};

export const DRINK_LABEL: Record<DrinkKind, string> = {
  water: 'Water',
  coffee: 'Coffee',
  tea: 'Tea',
  herbal: 'Herbal',
  other: 'Other',
};

export interface Bean {
  id: string;
  name: string;
  roast_date?: string | null;
  origin?: string | null;
  notes?: string | null;
}

export interface Brew {
  id: string;
  ratio: number;
  water_g: number;
  coffee_g: number;
  bean_id?: string | null;
  bean_name?: string | null;
  brewed_at: string;
}

export interface DoughSchedule {
  id: string;
  hydration: number;
  salt_pct: number;
  leaven_pct: number;
  flour_g: number;
  cold_hours: number;
  started_at: string;
  ready_at: string;
}

export interface Meal {
  id: string;
  method: CookMethod;
  internal_temp?: number | null;
  started_at: string;
  ended_at?: string | null;
  label?: string | null;
}

export interface Drink {
  id: string;
  kind: DrinkKind;
  logged_at: string;
}
