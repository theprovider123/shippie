/**
 * Shippie Body Metrics — local store.
 *
 * Single source of truth for measurements + photo metadata. Entries
 * live in localStorage (text-only — small, easy to inspect, easy to
 * wipe). Photo *blobs* live in IndexedDB via `photo-store.ts` and are
 * referenced here by id only. The split is deliberate: raw photo
 * bytes never sit alongside the easily-exported text data.
 */
import type { Measurement } from './trend.ts';

export type BodyFatMethod = 'navy' | 'skinfold' | 'scale';

export interface Entry extends Measurement {
  id: string;
  bodyFatPct?: number;
  bodyFatMethod?: BodyFatMethod;
  photoLocalId?: string;
  /** Optional free-text note. Stays on the device. */
  note?: string;
}

export interface Goal {
  /** kg target. */
  weightKg: number;
  /** YYYY-MM-DD date the user wants to hit it. */
  targetDate: string;
  /** Goal direction is computed; this just tracks whether the user
   *  set the goal *aiming up* or *down* relative to creation weight. */
  startWeightKg: number;
  /** YYYY-MM-DD when the goal was set — used for projection math. */
  startDate: string;
}

const ENTRIES_KEY = 'shippie.body-metrics.v1';
const GOAL_KEY = 'shippie.body-metrics.goal.v1';

export function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: readonly Entry[]): void {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

export function loadGoal(): Goal | null {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Goal;
    if (
      typeof parsed?.weightKg === 'number' &&
      typeof parsed?.targetDate === 'string' &&
      typeof parsed?.startDate === 'string' &&
      typeof parsed?.startWeightKg === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveGoal(goal: Goal | null): void {
  if (goal === null) {
    localStorage.removeItem(GOAL_KEY);
    return;
  }
  localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
}

/**
 * Sort newest-first for list display. Pure — no side effects.
 */
export function sortNewestFirst(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Sort oldest-first for chart / scrub display.
 */
export function sortOldestFirst(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}
