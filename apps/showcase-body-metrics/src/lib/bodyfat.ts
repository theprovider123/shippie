/**
 * Body fat — honest about method accuracy.
 *
 * The whole point of this module is to *not* claim DXA precision for
 * a bathroom scale. Each method ships with a typical ± confidence
 * band; we surface that band in the UI so users know what they're
 * looking at.
 *
 * Reference numbers below come from peer-reviewed comparisons of
 * each method against DXA (the gold standard short of MRI). They
 * are typical population bands, not personal calibration, and we
 * say so in the copy.
 */

export type BodyFatMethod = 'navy' | 'skinfold' | 'scale';

export interface MethodInfo {
  method: BodyFatMethod;
  label: string;
  /** Typical ±% absolute body fat error vs. DXA in adults. */
  typicalErrorPct: number;
  /** One-line plain-English caveat. */
  caveat: string;
}

export const METHODS: Record<BodyFatMethod, MethodInfo> = {
  navy: {
    method: 'navy',
    label: 'Navy tape',
    typicalErrorPct: 3,
    caveat: 'Tape measurements at neck, waist, (hips for women). ±3% typical.',
  },
  skinfold: {
    method: 'skinfold',
    label: 'Skinfold caliper',
    typicalErrorPct: 3.5,
    caveat: 'Three- or seven-site pinch test. ±3-4% typical, more with practice.',
  },
  scale: {
    method: 'scale',
    label: 'Bathroom BIA scale',
    typicalErrorPct: 5,
    caveat: 'Bioimpedance. Sensitive to hydration, food, time of day. ±5% typical.',
  },
};

/**
 * US Navy body-fat formula. Inputs in centimetres.
 *
 * Men:   86.010 * log10(waist - neck) - 70.041 * log10(height) + 36.76
 * Women: 163.205 * log10(waist + hip - neck) - 97.684 * log10(height) - 78.387
 *
 * Returns null if any input is missing or non-positive, or if the
 * intermediate value is undefined (waist <= neck for men, etc.).
 */
export function navyBodyFat(input: {
  sex: 'male' | 'female';
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number;
}): number | null {
  const { sex, heightCm, neckCm, waistCm, hipCm } = input;
  if (heightCm <= 0 || neckCm <= 0 || waistCm <= 0) return null;
  if (sex === 'female' && (!hipCm || hipCm <= 0)) return null;

  if (sex === 'male') {
    if (waistCm <= neckCm) return null;
    const pct = 86.01 * Math.log10(waistCm - neckCm) - 70.041 * Math.log10(heightCm) + 36.76;
    if (!Number.isFinite(pct)) return null;
    return clampToHumanRange(pct);
  }

  // female
  const sum = waistCm + (hipCm as number) - neckCm;
  if (sum <= 0) return null;
  const pct = 163.205 * Math.log10(sum) - 97.684 * Math.log10(heightCm) - 78.387;
  if (!Number.isFinite(pct)) return null;
  return clampToHumanRange(pct);
}

function clampToHumanRange(pct: number): number {
  // Anything outside 3–60% is implausible; return null to flag bad inputs.
  if (pct < 3 || pct > 60) return Number.NaN;
  return Math.round(pct * 10) / 10;
}

/**
 * Lean mass in kg given total weight + body-fat percentage. Useful
 * for tracking whether a "weight loss" is actually fat or muscle.
 */
export function leanMassKg(weightKg: number, bodyFatPct: number): number | null {
  if (weightKg <= 0 || bodyFatPct < 0 || bodyFatPct > 100) return null;
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}

/**
 * Confidence band for a measurement, given its method.
 */
export function bodyFatBand(pct: number, method: BodyFatMethod): {
  low: number;
  high: number;
  errorPct: number;
} {
  const info = METHODS[method];
  return {
    low: Math.max(0, Math.round((pct - info.typicalErrorPct) * 10) / 10),
    high: Math.min(100, Math.round((pct + info.typicalErrorPct) * 10) / 10),
    errorPct: info.typicalErrorPct,
  };
}
