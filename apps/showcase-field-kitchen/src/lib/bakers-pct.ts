/**
 * Baker's percentages — pure helper.
 *
 * Flour is always 100%. Hydration is water as a percentage of flour.
 * Salt + leaven are also percentages of flour. Given any of these
 * plus a flour weight, derive everything in grams.
 *
 * Reasonable bounds:
 *   - hydration: 50–100% (45 is dry brioche; 100+ is sourdough territory)
 *   - salt: 1.5–3% (anything outside that is suspicious; we don't block)
 *   - leaven: 5–30% (sourdough levain or commercial yeast slurry)
 */

export interface BakerInputs {
  flour_g: number;
  hydration: number;
  salt_pct: number;
  leaven_pct: number;
}

export interface BakerWeights {
  flour_g: number;
  water_g: number;
  salt_g: number;
  leaven_g: number;
  total_g: number;
}

export const HYDRATION_MIN = 30;
export const HYDRATION_MAX = 130;
export const SALT_MIN = 0;
export const SALT_MAX = 10;
export const LEAVEN_MIN = 0;
export const LEAVEN_MAX = 50;

export function clampPercent(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

export function clampFlour(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 500;
  return Math.max(50, Math.min(5000, Math.round(n)));
}

/**
 * Compute weights from baker's percentages.
 * Salt is rounded to 0.1g; everything else to whole grams.
 */
export function weighDough(input: BakerInputs): BakerWeights {
  const flour_g = clampFlour(input.flour_g);
  const hydration = clampPercent(input.hydration, HYDRATION_MIN, HYDRATION_MAX, 70);
  const salt_pct = clampPercent(input.salt_pct, SALT_MIN, SALT_MAX, 2);
  const leaven_pct = clampPercent(input.leaven_pct, LEAVEN_MIN, LEAVEN_MAX, 20);

  const water_g = Math.round((flour_g * hydration) / 100);
  const salt_g = Math.round((flour_g * salt_pct) / 100 * 10) / 10;
  const leaven_g = Math.round((flour_g * leaven_pct) / 100);
  const total_g = flour_g + water_g + Math.round(salt_g) + leaven_g;

  return { flour_g, water_g, salt_g, leaven_g, total_g };
}

/** Convenience: a single sanity check on whether the recipe looks edible. */
export function looksReasonable(input: BakerInputs): boolean {
  return (
    input.hydration >= 50 &&
    input.hydration <= 100 &&
    input.salt_pct >= 1.5 &&
    input.salt_pct <= 3 &&
    input.flour_g >= 100
  );
}
