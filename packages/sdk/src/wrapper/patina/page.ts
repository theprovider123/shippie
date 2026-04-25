import type { PatinaConfig, PatinaState } from './types.ts';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Map age + sensitivity to a 0–1 warmth value applied as a CSS variable.
 * Linear ramp from age 0 to age 1 year, capped at 1 (then multiplied by
 * sensitivity).
 */
export function computeWarmth(state: PatinaState, config: PatinaConfig, now: number): number {
  if (!config.enabled) return 0;
  const ageMs = now - state.firstSeenAt;
  const ratio = Math.min(1, Math.max(0, ageMs / ONE_YEAR_MS));
  return ratio * config.sensitivity;
}

export function applyPageWarmth(warmth: number, target: HTMLElement | null = null): void {
  const el =
    target ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;
  el.style.setProperty('--shippie-patina-warmth', warmth.toFixed(3));
}
