/**
 * Tiny rAF-driven interpolator. Returns a cancellable handle.
 *
 *   const t = tween(0, 100, 300, 'easeOut', (v) => { x = v; render(); });
 *   t.cancel();
 *
 * Easings inspired by Robert Penner. `spring` is a bouncy under-damped
 * approximation good for win/level-clear celebrations.
 */

export type EasingFn = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  spring: (t: number) => {
    // Under-damped spring approximation, ~1.5 oscillations.
    if (t === 1) return 1;
    return 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 2.5);
  },
} as const satisfies Record<string, EasingFn>;

export type EasingName = keyof typeof easings;

export interface TweenHandle {
  cancel(): void;
}

export function tween(
  from: number,
  to: number,
  durationMs: number,
  ease: EasingName | EasingFn,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): TweenHandle {
  if (typeof window === 'undefined') {
    onUpdate(to);
    onComplete?.();
    return { cancel: () => {} };
  }
  const easeFn = typeof ease === 'function' ? ease : easings[ease];
  const start = performance.now();
  let raf = 0;
  let cancelled = false;
  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    const eased = easeFn(t);
    onUpdate(from + (to - from) * eased);
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  };
  raf = requestAnimationFrame(step);
  return {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}
