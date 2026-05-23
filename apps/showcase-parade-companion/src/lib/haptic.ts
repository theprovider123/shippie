/**
 * Haptic alphabet — three patterns, no more. Stick to them everywhere so
 * the meaning is learnable: confirm = "saved" / warn = "rejected" / wow =
 * "arrived or moment." Silent fallback on platforms (iOS Safari) that don't
 * implement `navigator.vibrate`.
 */

const SUPPORTED =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Single short pulse — neutral confirm (a tap landed, a thing was saved). */
export function hapticConfirm(): void {
  if (SUPPORTED) navigator.vibrate(30);
}

/** Triple short pulse — warn / rejected (bad GPS, no fix, action refused). */
export function hapticWarn(): void {
  if (SUPPORTED) navigator.vibrate([60, 60, 60, 60, 60]);
}

/** Pulse + sustain — wow / arrived / mass-moment (rare, celebratory). */
export function hapticWow(): void {
  if (SUPPORTED) navigator.vibrate([30, 30, 200]);
}
