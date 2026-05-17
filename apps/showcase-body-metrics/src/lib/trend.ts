/**
 * Pure trend computation for weight measurements.
 *
 * Two functions live here:
 *
 *  - `computeTrend()` — slope (kg/day) + classification ('up' | 'down'
 *    | 'stable') from a linear regression over all samples. Needs at
 *    least 7 entries before it returns anything; below that the
 *    user is just looking at noise.
 *
 *  - `rollingAverage()` — windowed mean (default 7-day) for charting.
 *    Day-to-day weight noise (water, last meal, day-of-cycle) drowns
 *    the actual signal; the rolling average is what people should
 *    actually look at.
 */

export interface Measurement {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export type Trend = 'up' | 'down' | 'stable';

export interface TrendResult {
  trend: Trend;
  /** kg per day. Positive = gaining. */
  slope: number;
  sampleSize: number;
}

const MIN_SAMPLE = 7;
const STABLE_BAND_KG_PER_DAY = 0.05;

export function computeTrend(measurements: readonly Measurement[]): TrendResult | null {
  if (measurements.length < MIN_SAMPLE) return null;
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0]!.date).getTime();
  const x = sorted.map((m) => (new Date(m.date).getTime() - t0) / (24 * 60 * 60 * 1000));
  const y = sorted.map((m) => m.weightKg);
  const n = x.length;
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / n;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i]! - mx;
    num += dx * (y[i]! - my);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const trend: Trend =
    Math.abs(slope) <= STABLE_BAND_KG_PER_DAY ? 'stable' : slope > 0 ? 'up' : 'down';
  return { trend, slope, sampleSize: n };
}

export interface RollingPoint {
  date: string;
  weightKg: number;
  /** Trailing window mean. `null` until the window is full. */
  rollingKg: number | null;
}

/**
 * Compute trailing rolling average over `windowDays` days. Pads the
 * lead-in with `null` so the chart can draw daily dots immediately
 * but only start the rolling line once we have a full window.
 *
 * Pure: never mutates input.
 */
export function rollingAverage(
  measurements: readonly Measurement[],
  windowDays = 7,
): RollingPoint[] {
  if (windowDays < 1) throw new Error('windowDays must be >= 1');
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const out: RollingPoint[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const m = sorted[i]!;
    if (i + 1 < windowDays) {
      out.push({ date: m.date, weightKg: m.weightKg, rollingKg: null });
      continue;
    }
    let sum = 0;
    for (let j = i - windowDays + 1; j <= i; j += 1) sum += sorted[j]!.weightKg;
    out.push({ date: m.date, weightKg: m.weightKg, rollingKg: sum / windowDays });
  }
  return out;
}

/**
 * Friendly weekly delta for copy. Returns null below MIN_SAMPLE so
 * we don't pretend to know.
 */
export function weeklyDeltaKg(measurements: readonly Measurement[]): number | null {
  const t = computeTrend(measurements);
  if (!t) return null;
  return t.slope * 7;
}
