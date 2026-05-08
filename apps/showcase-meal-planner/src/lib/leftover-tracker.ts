/**
 * Leftover tracking.
 *
 * When a slot is marked "cooked" with a `cookedFor` count below its
 * scaled servings, the surplus becomes a leftover entry: "leftovers in
 * fridge, eat by Wed". Pure derivation — no I/O — so the host
 * component decides when to broadcast.
 *
 * The default "eat by" window is three days; food-safety guidance for
 * cooked dishes in a fridge is typically 3–4 days. We err short.
 */

import type { LeftoverRow } from './types.ts';

const DEFAULT_EAT_BY_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LeftoverInput {
  recipeName: string;
  scaledServings: number;
  cookedFor: number;
  cookedAt?: Date;
  /** Stable id seed — usually `${day}|${slot}|${recipeName}`. */
  idSeed: string;
}

export function deriveLeftover(input: LeftoverInput): LeftoverRow | null {
  const surplus = Math.max(0, input.scaledServings - input.cookedFor);
  if (surplus <= 0) return null;
  const cookedAt = input.cookedAt ?? new Date();
  const eatByDate = new Date(cookedAt.getTime() + DEFAULT_EAT_BY_DAYS * MS_PER_DAY);
  return {
    id: hashId(input.idSeed + '|' + cookedAt.toISOString()),
    recipeName: input.recipeName,
    servings: surplus,
    cookedAt: cookedAt.toISOString(),
    eatBy: eatByDate.toISOString(),
  };
}

/** Friendly day-of-week label: "Mon", "Tue", … or "Today"/"Tomorrow". */
export function describeEatBy(eatByISO: string, now: Date = new Date()): string {
  const eatBy = new Date(eatByISO);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEatBy = new Date(eatBy.getFullYear(), eatBy.getMonth(), eatBy.getDate());
  const dayDiff = Math.round((startOfEatBy.getTime() - startOfToday.getTime()) / MS_PER_DAY);
  if (dayDiff <= 0) return 'eat today';
  if (dayDiff === 1) return 'eat by tomorrow';
  if (dayDiff <= 6) {
    const weekday = eatBy.toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase();
    return `eat by ${weekday}`;
  }
  return `eat by ${eatBy.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function hashId(seed: string): string {
  // Tiny FNV-1a — deterministic, no crypto, fine for an iframe demo.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'lo_' + h.toString(16);
}
