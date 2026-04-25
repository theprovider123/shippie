// packages/sdk/src/wrapper/gestures.ts
/**
 * Pointer-event based gestures for the wrapper.
 *
 * Each attach fn adds listeners and returns a detach fn. Callers own
 * the lifetime; wrapper bootstrap calls detach on cleanup.
 */

export interface BackSwipeOptions {
  /** How many px from the left edge counts as "edge start". */
  edgeWidth?: number;
  /** Horizontal px the pointer must travel to trigger. */
  threshold?: number;
  onTrigger: () => void;
}

export function attachBackSwipe(opts: BackSwipeOptions): () => void {
  if (typeof document === 'undefined') return () => {};
  const edgeWidth = opts.edgeWidth ?? 24;
  const threshold = opts.threshold ?? 60;
  let active: { startX: number; startY: number; id: number } | null = null;

  const down = (e: Event) => {
    const p = e as PointerEvent;
    if (p.clientX > edgeWidth) return;
    active = { startX: p.clientX, startY: p.clientY, id: p.pointerId };
  };
  const move = (e: Event) => {
    const p = e as PointerEvent;
    if (!active || p.pointerId !== active.id) return;
    const dx = p.clientX - active.startX;
    const dy = Math.abs(p.clientY - active.startY);
    if (dx >= threshold && dy < threshold) {
      active = null;
      opts.onTrigger();
    }
  };
  const up = () => {
    active = null;
  };

  document.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);

  return () => {
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
  };
}

export interface PullToRefreshOptions {
  threshold?: number;
  onRefresh: () => void;
}

/**
 * Minimal structural shape the target must satisfy. Using a structural
 * type (rather than DOM lib's `EventTarget`) keeps us interoperable with
 * happy-dom in tests and any other runtime that ships its own DOM typings.
 */
export interface PullToRefreshTarget {
  scrollTop?: number;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
}

export function attachPullToRefresh(
  target: PullToRefreshTarget,
  opts: PullToRefreshOptions,
): () => void {
  const threshold = opts.threshold ?? 60;
  let start: { y: number; id: number } | null = null;

  const down = (e: unknown) => {
    const p = e as PointerEvent;
    if ((target.scrollTop ?? 0) > 0) return;
    start = { y: p.clientY, id: p.pointerId };
  };
  const move = (e: unknown) => {
    const p = e as PointerEvent;
    if (!start || p.pointerId !== start.id) return;
    const dy = p.clientY - start.y;
    if (dy >= threshold) {
      start = null;
      void import('./textures/engine.ts')
        .then(({ fireTexture }) => {
          try {
            fireTexture('refresh');
          } catch {
            /* swallow */
          }
        })
        .catch(() => {
          /* swallow */
        });
      opts.onRefresh();
    }
  };
  const up = () => {
    start = null;
  };

  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);

  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
}
