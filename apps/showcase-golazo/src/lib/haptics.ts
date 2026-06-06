// Tiny haptic + feedback helpers. All best-effort and silent on unsupported
// devices, so callers never need to guard. Pub Night Mode mutes them all.

let muted = false;
/** Pub Night Mode silences buzzing so a phone going round the table is calm. */
export function setHapticsMuted(m: boolean): void {
  muted = m;
}

export function tap(): void {
  if (muted) return;
  try {
    navigator.vibrate?.(8);
  } catch {
    /* no-op */
  }
}

export function confirmBuzz(): void {
  if (muted) return;
  try {
    navigator.vibrate?.([10, 30, 10]);
  } catch {
    /* no-op */
  }
}

export function celebrate(): void {
  if (muted) return;
  try {
    navigator.vibrate?.([12, 40, 12, 40, 24]);
  } catch {
    /* no-op */
  }
}
