/**
 * Brew ratio helpers — pure, testable.
 *
 * The ratio dial is `water grams / coffee grams`. Most home brewers
 * live in 14–18; espresso lives lower (1.5–2.5); cold brew sits
 * higher (8–12 by some recipes, much higher by others).
 *
 * We don't enforce a method here — the user picks. We just keep the
 * arithmetic honest and the bounds reasonable so a stuck slider can't
 * produce 0 g of coffee.
 */

export const RATIO_MIN = 1;
export const RATIO_MAX = 30;
export const COFFEE_G_MIN = 1;
export const COFFEE_G_MAX = 100;

export interface BrewSettings {
  ratio: number;
  coffee_g: number;
  water_g: number;
}

/**
 * Clamp + round a ratio to one decimal. Anything outside [RATIO_MIN,
 * RATIO_MAX] gets pulled back into range; NaN/undefined fall back to 16
 * (a reasonable pourover default).
 */
export function clampRatio(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 16;
  const clamped = Math.max(RATIO_MIN, Math.min(RATIO_MAX, n));
  return Math.round(clamped * 10) / 10;
}

export function clampCoffee(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 15;
  return Math.max(COFFEE_G_MIN, Math.min(COFFEE_G_MAX, Math.round(n)));
}

/** Given coffee grams + ratio, compute the water grams (rounded). */
export function waterFromCoffee(coffeeG: number, ratio: number): number {
  return Math.round(clampCoffee(coffeeG) * clampRatio(ratio));
}

/** Given a target water amount and ratio, derive coffee grams (rounded to 0.1). */
export function coffeeFromWater(waterG: number, ratio: number): number {
  const r = clampRatio(ratio);
  if (r <= 0) return 0;
  const coffee = waterG / r;
  return Math.round(coffee * 10) / 10;
}

export function buildBrewSettings(coffeeG: number, ratio: number): BrewSettings {
  const c = clampCoffee(coffeeG);
  const r = clampRatio(ratio);
  return { ratio: r, coffee_g: c, water_g: waterFromCoffee(c, r) };
}

/** Format a brew timer (mm:ss) — used everywhere a number of seconds is shown. */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
