/**
 * Dough app persistence.
 *
 * Three stores, all in localStorage under a single namespaced key:
 *   - `recipes` — user-saved Recipe specs (the recipe library).
 *   - `bakes` — active + completed bakes. An "active" bake has no
 *     finished_at; a "completed" bake has finished_at and an outcome.
 *   - `prefs` — user-level preferences (notification opt-in, last
 *     selected mode, etc.)
 *
 * Migration policy: read tolerantly, ignore unknown keys, never throw
 * on bad JSON. Older v1 payloads (just `{ bakes: [...] }`) are read
 * straight through.
 */

import type { Recipe } from './recipes.ts';

const STORAGE_KEY = 'shippie.dough.v2';

export interface Bake {
  id: string;
  recipe_id: string;
  recipe_name: string;
  /** Snapshot of the recipe spec at the moment the bake started. */
  recipe_snapshot: Recipe;
  /** Target total dough mass in grams. */
  total_g: number;
  /** ISO timestamps. */
  started_at: string;
  ready_at: string;
  finished_at: string | null;
  outcome: BakeOutcome | null;
}

export interface BakeOutcome {
  /** 1–5 crumb rating. */
  crumb_rating: number;
  /** 1–5 crust rating. */
  crust_rating: number;
  /** Free-form notes — "next time pull bulk 30 min earlier". */
  notes: string;
  /** Optional photo URL (data: or http). */
  photo_url?: string;
  logged_at: string;
}

export interface Prefs {
  /** Last leaven mode the user picked, used as the default for "new". */
  lastMode?: 'sourdough' | 'yeast';
  /** True when the user has explicitly opted into notifications. */
  notifyOptIn?: boolean;
}

interface Persisted {
  recipes: Recipe[];
  bakes: Bake[];
  prefs: Prefs;
}

interface LegacyV1 {
  bakes?: Array<{
    id: string;
    recipe_id: string;
    recipe_name: string;
    [k: string]: unknown;
  }>;
}

const EMPTY: Persisted = { recipes: [], bakes: [], prefs: {} };

/**
 * Load full state. Tolerant of malformed JSON, missing keys, and the
 * old v1 shape.
 */
export function load(): Persisted {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<Persisted>;
      return {
        recipes: Array.isArray(parsed.recipes) ? (parsed.recipes as Recipe[]) : [],
        bakes: Array.isArray(parsed.bakes) ? (parsed.bakes as Bake[]) : [],
        prefs:
          parsed.prefs && typeof parsed.prefs === 'object' ? (parsed.prefs as Prefs) : {},
      };
    }
    // Try the v1 key.
    const rawV1 = localStorage.getItem('shippie.dough.v1');
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as LegacyV1;
      return {
        recipes: [],
        // v1 bakes are missing recipe_snapshot — leave them out of the active
        // list and let the user log fresh ones. Keeping the legacy entries
        // around as opaque history would make the UI lie.
        bakes: [],
        prefs: {},
      };
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

export function save(state: Persisted): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort — quota exceeded etc. */
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Filter helper — bakes still in flight. */
export function activeBakes(bakes: ReadonlyArray<Bake>): Bake[] {
  return bakes.filter((b) => b.finished_at === null);
}

/** Filter helper — completed bakes (most recent first). */
export function completedBakes(bakes: ReadonlyArray<Bake>): Bake[] {
  return bakes
    .filter((b) => b.finished_at !== null)
    .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''));
}
