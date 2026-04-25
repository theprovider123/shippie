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

export interface SemanticHapticsOptions {
  buttons?: HapticKind | false;
  toggles?: HapticKind | false;
  forms?: HapticKind | false;
  invalid?: HapticKind | false;
}

export function attachSemanticHaptics(
  root: Document | Element = document,
  opts: SemanticHapticsOptions = {},
): () => void {
  if (!root?.addEventListener) return () => {};
  const buttonKind = opts.buttons ?? 'tap';
  const toggleKind = opts.toggles ?? 'tap';
  const formKind = opts.forms ?? 'success';
  const invalidKind = opts.invalid ?? 'error';

  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (toggleKind && target.closest('input[type="checkbox"], input[type="radio"], [role="switch"], [aria-pressed]')) {
      haptic(toggleKind);
      return;
    }
    if (buttonKind && target.closest('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]')) {
      haptic(buttonKind);
    }
  };
  const onSubmit = () => {
    if (formKind) haptic(formKind);
  };
  const onInvalid = () => {
    if (invalidKind) haptic(invalidKind);
  };

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('invalid', onInvalid, true);

  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('invalid', onInvalid, true);
  };
}
