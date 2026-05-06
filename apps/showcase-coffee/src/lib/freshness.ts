/**
 * Roast-date freshness math.
 *
 * Filter coffee peaks roughly 7–14 days after roast and is meaningfully
 * fading by ~3 weeks. Espresso is denser, develops longer in the bag, and
 * holds up to ~6 weeks. These thresholds are folklore-grade — every bean
 * is different — but they're the right shape for a "where is this bean
 * on the curve" visualisation.
 *
 * The bands intentionally overlap visually on the chart (rest → peak →
 * good → fading → stale) but the band returned here is one-of, snapping
 * to whichever the bean falls into right now.
 */
import type { BrewMethod } from '../db.ts';

export type FreshnessBand = 'rest' | 'peak' | 'good' | 'fading' | 'stale';

export interface FreshnessReading {
  daysSinceRoast: number;
  band: FreshnessBand;
  /** 0..1 position within the lifecycle, useful for chart bar fill. */
  position: number;
  /** "peak" / "good" / "fading" / "stale" / "rest". One word. */
  label: string;
  /** Long-form, e.g. "drink it now". */
  hint: string;
}

interface BandThresholds {
  /** How many days of off-gassing before the bean is ready to drink. */
  rest: number;
  /** End of the peak window (inclusive). */
  peak: number;
  /** End of the "good" window. */
  good: number;
  /** End of the "fading" window — beyond this is stale. */
  fading: number;
}

/** Per-mode thresholds in days. Espresso holds longer. */
export const FRESHNESS_THRESHOLDS: Record<'filter' | 'espresso', BandThresholds> = {
  filter: { rest: 4, peak: 14, good: 21, fading: 35 },
  espresso: { rest: 7, peak: 21, good: 35, fading: 56 },
};

export function modeFor(method: BrewMethod): 'filter' | 'espresso' {
  return method === 'espresso' ? 'espresso' : 'filter';
}

/** Day-difference floor between two ISO dates (YYYY-MM-DD). Returns 0
 * for "today" and a positive integer for past roast dates. Future-dated
 * roasts (clock skew, typo) clamp to 0. */
export function daysSince(roastDate: string, now: Date = new Date()): number {
  const roast = new Date(`${roastDate}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Number.isNaN(roast)) return 0;
  const diff = Math.floor((today - roast) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

const LABEL: Record<FreshnessBand, string> = {
  rest: 'rest',
  peak: 'peak',
  good: 'good',
  fading: 'fading',
  stale: 'stale',
};

const HINT: Record<FreshnessBand, string> = {
  rest: 'still off-gassing — give it a few days',
  peak: 'drink it now',
  good: 'still tasty',
  fading: 'use it up soon',
  stale: 'past it — make cold brew or compost',
};

export function band(method: BrewMethod, days: number): FreshnessBand {
  const t = FRESHNESS_THRESHOLDS[modeFor(method)];
  if (days < t.rest) return 'rest';
  if (days <= t.peak) return 'peak';
  if (days <= t.good) return 'good';
  if (days <= t.fading) return 'fading';
  return 'stale';
}

export function reading(method: BrewMethod, roastDate: string | undefined, now: Date = new Date()): FreshnessReading | null {
  if (!roastDate) return null;
  const days = daysSince(roastDate, now);
  const t = FRESHNESS_THRESHOLDS[modeFor(method)];
  const b = band(method, days);
  const position = Math.min(1, days / t.fading);
  return {
    daysSinceRoast: days,
    band: b,
    position,
    label: LABEL[b],
    hint: HINT[b],
  };
}
