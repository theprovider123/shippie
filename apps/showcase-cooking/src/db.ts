/**
 * Cooking app persistence — recent cooks. localStorage.
 */
const STORAGE_KEY = 'shippie.cooking.v1';

import type { Doneness, Method } from './data.ts';

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
}

interface Persisted {
  cooks: Cook[];
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cooks: [] };
    const parsed = JSON.parse(raw) as Persisted;
    return { cooks: Array.isArray(parsed.cooks) ? parsed.cooks : [] };
  } catch {
    return { cooks: [] };
  }
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
