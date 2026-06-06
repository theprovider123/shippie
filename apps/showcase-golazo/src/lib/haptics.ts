// Tiny haptic + feedback helpers. All best-effort and silent on unsupported
// devices, so callers never need to guard.

export function tap(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* no-op */
  }
}

export function confirmBuzz(): void {
  try {
    navigator.vibrate?.([10, 30, 10]);
  } catch {
    /* no-op */
  }
}

export function celebrate(): void {
  try {
    navigator.vibrate?.([12, 40, 12, 40, 24]);
  } catch {
    /* no-op */
  }
}
