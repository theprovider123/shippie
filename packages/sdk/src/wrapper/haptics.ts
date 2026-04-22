// packages/sdk/src/wrapper/haptics.ts
/**
 * Tiny haptic helper. `navigator.vibrate` is a no-op on iOS; iOS users
 * won't feel this, but the rest of the web does. Guarded on
 * `prefers-reduced-motion` for accessibility.
 */
export type HapticKind = 'tap' | 'success' | 'warn' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  success: [10, 40, 10],
  warn: [20, 60, 20],
  error: [40, 30, 10],
};

export function haptic(kind: HapticKind): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  } catch {
    // matchMedia may throw in very old environments; best-effort.
  }
  const vibrate = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
  if (typeof vibrate !== 'function') return;
  try {
    vibrate.call(navigator, PATTERNS[kind]);
  } catch {
    // swallow — haptics are non-essential
  }
}
