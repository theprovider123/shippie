/**
 * Caffeine pharmacokinetics — first-order decay.
 *
 * Caffeine has a half-life of roughly 5 hours in healthy adults, with
 * substantial individual variation (3 h to 9 h). We expose the
 * half-life as a parameter so the user could in principle tune it,
 * though we don't surface a UI control for that yet.
 *
 * The model is the standard exponential decay:
 *   amount(t) = dose * 0.5 ^ (Δt_hours / half_life_hours)
 *
 * Pre-absorption (caffeine peaks ~30–45 minutes after ingestion) is
 * ignored on purpose — at the time-resolution of this UI (a horizontal
 * bar across a day) the simplification is invisible, and modelling
 * absorption + distribution would require a two-compartment model that
 * isn't worth the extra surface area for a wellness logger.
 */

import type { Sip } from '../db.ts';

export const DEFAULT_HALF_LIFE_HOURS = 5;

/**
 * Residual caffeine in mg from a single dose at a given moment.
 *
 * `dose_mg` is the caffeine ingested, `hours_since` how long ago.
 * Returns 0 for negative time (before ingestion) so the curve can be
 * sampled freely without conditional checks at the call site.
 */
export function residualFromDose(
  dose_mg: number,
  hours_since: number,
  half_life_hours: number = DEFAULT_HALF_LIFE_HOURS,
): number {
  if (hours_since < 0) return 0;
  if (dose_mg <= 0) return 0;
  return dose_mg * Math.pow(0.5, hours_since / half_life_hours);
}

/**
 * Sum of residual caffeine in mg from all sips up to a moment in time.
 *
 * Sips logged after `at_iso` are ignored (so this works for plotting
 * the curve across an entire day in one pass).
 */
export function residualAt(
  sips: ReadonlyArray<Sip>,
  at_iso: string,
  half_life_hours: number = DEFAULT_HALF_LIFE_HOURS,
): number {
  const at_ms = new Date(at_iso).getTime();
  let total = 0;
  for (const sip of sips) {
    if (sip.mg <= 0) continue;
    const sip_ms = new Date(sip.logged_at).getTime();
    if (sip_ms > at_ms) continue;
    const hours = (at_ms - sip_ms) / (60 * 60 * 1000);
    total += residualFromDose(sip.mg, hours, half_life_hours);
  }
  return total;
}

/**
 * Generate a curve of [hour, residual_mg] samples across a day.
 *
 * `day_start_iso` is the start of the day (00:00 local). We sample at
 * `step_minutes` granularity and return numbers ready for an SVG path.
 */
export function caffeineCurve(
  sips: ReadonlyArray<Sip>,
  day_start_iso: string,
  step_minutes: number = 15,
  half_life_hours: number = DEFAULT_HALF_LIFE_HOURS,
): Array<{ minute: number; mg: number }> {
  const start_ms = new Date(day_start_iso).getTime();
  const total_minutes = 24 * 60;
  const out: Array<{ minute: number; mg: number }> = [];
  for (let m = 0; m <= total_minutes; m += step_minutes) {
    const at_iso = new Date(start_ms + m * 60 * 1000).toISOString();
    out.push({ minute: m, mg: residualAt(sips, at_iso, half_life_hours) });
  }
  return out;
}

/**
 * Predict residual caffeine at midnight (start of next day).
 *
 * "Midnight residual" is the headline number for the daily summary —
 * if it's high, you'll feel it in your sleep.
 */
export function midnightResidual(
  sips: ReadonlyArray<Sip>,
  day_key: string,
  half_life_hours: number = DEFAULT_HALF_LIFE_HOURS,
): number {
  // Midnight = start of the next day, in local time.
  const [y, m, d] = day_key.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const midnight = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return residualAt(sips, midnight.toISOString(), half_life_hours);
}

/**
 * Classify a midnight residual into a sleep-impact bucket.
 *
 * Thresholds are conservative defaults — most adults sleep through
 * <50 mg residual; 50–100 mg is a meaningful nudge to sleep latency;
 * >100 mg correlates with measurable sleep-quality drops in the
 * Drake et al. 2013 caffeine-and-sleep paper.
 */
export type SleepImpact = 'clear' | 'mild' | 'high';

export function classifyMidnightResidual(mg: number): SleepImpact {
  if (mg < 50) return 'clear';
  if (mg < 100) return 'mild';
  return 'high';
}
