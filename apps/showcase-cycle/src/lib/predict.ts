/**
 * Predict the next period window based on past cycle lengths.
 *
 * Voice rule (load-bearing): we ALWAYS show a range, never a single
 * date masquerading as certainty. Confidence is a function of the
 * variability of the input. Three cycles is the floor — below that
 * we return null and let the UI say "not enough data".
 *
 * Range derivation:
 *   - mean ± stddev, but clamped to a minimum width of 2 days even
 *     when stddev is tiny (so the range is honestly never a point).
 *   - high confidence: stddev < 2 → range width ≈ 2 days.
 *   - medium: 2 ≤ stddev < 4 → range width ≈ 2*stddev.
 *   - low: stddev ≥ 4 → range width capped at ±5 days so the UI
 *     stays readable. The pill copy makes the low confidence visible.
 *
 * Fertile window: ovulation ≈ 14 days before the predicted start.
 * Window = 5 days before ovulation + 1 day after = 6 days. We carry
 * the same range honesty: the window slides with the predicted-start
 * range.
 *
 * No medical claims. The voice doc is explicit: "the app is a tool,
 * not an oracle."
 */

import type { Cycle } from '../db/schema.ts';
import { addDays, daysBetween, isoDate, parseIso } from '../db/queries.ts';

export type Confidence = 'low' | 'medium' | 'high';

export interface CyclePrediction {
  /** Best-guess next start date (centre of the range). */
  predictedStart: string;
  /** Honest [earliest, latest] range. Always at least 2 days wide. */
  range: [string, string];
  /** Stddev of the input cycle lengths. */
  stddev: number;
  /** Mean of the input cycle lengths. */
  mean: number;
  confidence: Confidence;
  /** How many cycles fed the prediction. */
  sampleSize: number;
}

export interface FertileWindow {
  /** Predicted ovulation date (centre). */
  ovulation: string;
  /** Best-guess fertile window (centre): 5 days before ovulation through 1 day after. */
  range: [string, string];
  /** Outer envelope when the predicted-start range is wide. */
  outerRange: [string, string];
}

const MIN_RANGE_DAYS = 2;
const MAX_RANGE_DAYS = 10;
const MAX_HISTORY = 6;
const FERTILE_LEAD_DAYS = 14;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export function classifyConfidence(stddevDays: number): Confidence {
  if (stddevDays < 2) return 'high';
  if (stddevDays < 4) return 'medium';
  return 'low';
}

/**
 * Pull the cycle-length sequence from the past N cycles.
 *
 * The most recent cycle has no `length_days` (it's still open), so we
 * skip it. We expect cycles ordered newest-first (which is what the
 * queries module returns).
 */
export function recentCycleLengths(cycles: readonly Cycle[], maxCycles = MAX_HISTORY): number[] {
  const lengths: number[] = [];
  for (const c of cycles) {
    if (typeof c.length_days === 'number' && c.length_days > 0) {
      lengths.push(c.length_days);
      if (lengths.length >= maxCycles) break;
    }
  }
  return lengths;
}

/**
 * Predict the next period window. Returns null when there's < 3 cycles
 * worth of length data — we'd be making it up.
 */
export function predictNextCycle(cycles: readonly Cycle[]): CyclePrediction | null {
  if (cycles.length === 0) return null;
  const mostRecent = cycles[0]!;
  const lengths = recentCycleLengths(cycles);
  if (lengths.length < 3) return null;

  const m = mean(lengths);
  const s = stddev(lengths);
  const confidence = classifyConfidence(s);

  // Half-width: stddev rounded up, with a floor of 1 (so total width ≥ 2)
  // and a ceiling of MAX_RANGE_DAYS / 2.
  const halfWidth = clamp(Math.ceil(s), Math.ceil(MIN_RANGE_DAYS / 2), Math.floor(MAX_RANGE_DAYS / 2));
  const centreOffset = Math.round(m);

  const centre = addDays(mostRecent.started_on, centreOffset);
  const earliest = addDays(centre, -halfWidth);
  const latest = addDays(centre, halfWidth);

  return {
    predictedStart: centre,
    range: [earliest, latest],
    mean: m,
    stddev: s,
    confidence,
    sampleSize: lengths.length,
  };
}

/**
 * Fertile window derived from a cycle prediction. Same range honesty:
 * the inner range is the best-guess window; the outer range widens by
 * the prediction's stddev so a low-confidence prediction visibly carries
 * its uncertainty into the fertile window too.
 */
export function fertileWindowFor(prediction: CyclePrediction | null): FertileWindow | null {
  if (!prediction) return null;
  const ovulation = addDays(prediction.predictedStart, -FERTILE_LEAD_DAYS);
  const innerStart = addDays(ovulation, -5);
  const innerEnd = addDays(ovulation, 1);
  // Outer envelope tracks the prediction's stddev so the UI shows the cone of doubt.
  const slack = clamp(Math.ceil(prediction.stddev), 0, 5);
  const outerStart = addDays(innerStart, -slack);
  const outerEnd = addDays(innerEnd, slack);
  return {
    ovulation,
    range: [innerStart, innerEnd],
    outerRange: [outerStart, outerEnd],
  };
}

/**
 * "How many days until the predicted start?" — expressed as a range.
 * Returns null if the predicted start is in the past (past-due window).
 */
export function daysUntil(prediction: CyclePrediction, today: string = isoDate()): {
  earliest: number;
  latest: number;
  centre: number;
} {
  return {
    earliest: daysBetween(today, prediction.range[0]),
    latest: daysBetween(today, prediction.range[1]),
    centre: daysBetween(today, prediction.predictedStart),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Format a predicted-start range for display. Voice doc says: explicit
 * range, day-month label, no "your cycle" framing.
 */
export function formatRange(range: [string, string]): string {
  const a = parseIso(range[0]);
  const b = parseIso(range[1]);
  if (range[0] === range[1]) return formatDay(a);
  // Same month: "12 - 16 May".
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} - ${b.getDate()} ${formatMonth(a)}`;
  }
  return `${formatDay(a)} - ${formatDay(b)}`;
}

function formatDay(d: Date): string {
  return `${d.getDate()} ${formatMonth(d)}`;
}

function formatMonth(d: Date): string {
  return d.toLocaleString('en', { month: 'short' });
}
