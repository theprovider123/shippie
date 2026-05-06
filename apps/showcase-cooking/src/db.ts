/**
 * Cooking app persistence — cooks (active + finished) + ratings + notes.
 * localStorage. Schema versioned via the storage key.
 *
 * v2 (this file) extends v1 cooks with rating + note + intent_payload
 * for the cooked-meal broadcast. v1 records are migrated lazily on read.
 */

import type { Doneness, Method } from './data.ts';

const STORAGE_KEY = 'shippie.cooking.v2';
const LEGACY_KEY = 'shippie.cooking.v1';

export interface Cook {
  id: string;
  cut_id: string;
  cut_name: string;
  method: Method;
  doneness: Doneness | null;
  weight_kg: number | null;
  target_temp_c: number;
  cook_minutes: number;
  rest_minutes: number;
  started_at: string;
  finished_at: string | null;
  /** User rating after marking cooked, 1–5. Optional. */
  rating: number | null;
  /** Free-form note: "pull at 200°F next time", etc. */
  note: string | null;
  /** Denormalised intent payload broadcast on cooked-meal. */
  intent_payload?: {
    cut: string;
    method: Method;
    cookedAt: string;
    rating: number | null;
  };
}

interface Persisted {
  cooks: Cook[];
}

interface PersistedV1 {
  cooks: Array<Omit<Cook, 'rating' | 'note' | 'intent_payload'>>;
}

export function load(): Persisted {
  // Try v2 first.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      return { cooks: Array.isArray(parsed.cooks) ? parsed.cooks : [] };
    }
  } catch {
    /* fall through to legacy */
  }

  // Migrate v1 → v2 once.
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as PersistedV1;
      const migrated: Cook[] = (Array.isArray(parsed.cooks) ? parsed.cooks : []).map(
        (c) => ({ ...c, rating: null, note: null }),
      );
      const next: Persisted = { cooks: migrated };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    }
  } catch {
    /* nothing to migrate */
  }

  return { cooks: [] };
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

export function newId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** A cook is active if it has been started but not finished. */
export function isActive(cook: Cook): boolean {
  return cook.finished_at === null;
}

/** Compute estimated finish ISO timestamp from a cook's start. */
export function estimatedFinishIso(cook: Cook): string {
  const start = new Date(cook.started_at).getTime();
  return new Date(
    start + (cook.cook_minutes + cook.rest_minutes) * 60_000,
  ).toISOString();
}

/** Seconds remaining until estimated finish. Negative if past. */
export function secondsRemaining(cook: Cook, now = Date.now()): number {
  const finishMs = new Date(estimatedFinishIso(cook)).getTime();
  return Math.round((finishMs - now) / 1000);
}
