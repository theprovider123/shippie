/**
 * Pure trend computation for weight measurements.
 *
 * Uses a simple linear regression slope to surface a "trending up" /
 * "trending down" / "stable" classification once the user has logged
 * 7+ entries. Below threshold, surface raw entries only.
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
