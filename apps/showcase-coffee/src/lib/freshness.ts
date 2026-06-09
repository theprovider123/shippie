// Flavour-window calculations.
//
// Peak windows are off-roast, by roast level:
//   light  → 10–28 days
//   medium →  7–21 days
//   dark   →  5–14 days
// Espresso is denser and develops longer in the bag, so it adds 5 days to
// both ends of whichever window applies.
//
// These are folklore-grade thresholds — every coffee is different — but
// they're the right shape for a "where is this bag on the curve" read.

import type { BrewMethod, RoastLevel } from '../types.ts';

export type FreshnessStatus = 'too-fresh' | 'approaching-peak' | 'at-peak' | 'past-peak';

export interface Freshness {
  /** Whole days since the roast date (0 if undated or future-dated). */
  daysOffRoast: number;
  status: FreshnessStatus;
  /** Short display word the UI shows: Resting / Almost / At peak / Fading. */
  label: string;
  peakWindowStart: number;
  peakWindowEnd: number;
  /** Convenience tuple for <FreshnessBar window={…} />. */
  window: [number, number];
  /** Alias of daysOffRoast for the bar's marker. */
  day: number;
  /** Whether a roast date was available at all. */
  dated: boolean;
}

const WINDOWS: Record<RoastLevel, [number, number]> = {
  light: [10, 28],
  medium: [7, 21],
  dark: [5, 14],
};

const ESPRESSO_SHIFT = 5;

export function peakWindow(roastLevel: RoastLevel, method?: BrewMethod): [number, number] {
  const [start, end] = WINDOWS[roastLevel];
  if (method === 'espresso') return [start + ESPRESSO_SHIFT, end + ESPRESSO_SHIFT];
  return [start, end];
}

/** Whole days between an ISO roast date and `now`, floored, clamped at 0. */
export function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.floor((today - then) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

function classify(day: number, start: number, end: number): { status: FreshnessStatus; label: string } {
  if (day < start) {
    // Within ~2 days of opening peak reads as "almost there".
    return start - day <= 2
      ? { status: 'approaching-peak', label: 'Almost' }
      : { status: 'too-fresh', label: 'Resting' };
  }
  if (day <= end) return { status: 'at-peak', label: 'At peak' };
  return { status: 'past-peak', label: 'Fading' };
}

export interface FreshnessInput {
  roastDate?: string;
  roastLevel: RoastLevel;
  /** When brewing as espresso the window shifts later. */
  method?: BrewMethod;
  now?: Date;
}

export function freshness({ roastDate, roastLevel, method, now }: FreshnessInput): Freshness {
  const [start, end] = peakWindow(roastLevel, method);
  if (!roastDate) {
    return {
      daysOffRoast: 0,
      status: 'too-fresh',
      label: 'No date',
      peakWindowStart: start,
      peakWindowEnd: end,
      window: [start, end],
      day: 0,
      dated: false,
    };
  }
  const day = daysSince(roastDate, now ?? new Date());
  const { status, label } = classify(day, start, end);
  return {
    daysOffRoast: day,
    status,
    label,
    peakWindowStart: start,
    peakWindowEnd: end,
    window: [start, end],
    day,
    dated: true,
  };
}
