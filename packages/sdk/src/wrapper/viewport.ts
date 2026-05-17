/**
 * useViewport — read viewport size + classify mode at call time.
 *
 * Returns the dynamic viewport (visualViewport.height when available,
 * else innerHeight) plus the static svh / lvh equivalents and a coarse
 * mobile/tablet/desktop classification matching the platform shell's
 * own breakpoints (mobile <768px, tablet 768–1279px, desktop ≥1280px).
 *
 * Stateless — call inside an effect / resize listener if you need to
 * react to changes. Use `window.visualViewport.addEventListener('resize')`
 * (more accurate than window.resize on iOS Safari with the keyboard
 * open).
 */
export interface ViewportSnapshot {
  width: number;
  height: number;
  /** Static "small" viewport — equivalent to 100svh. */
  svh: number;
  /** Static "large" viewport — equivalent to 100lvh. */
  lvh: number;
  /** Dynamic viewport — equivalent to 100dvh; shrinks when iOS keyboard opens. */
  dvh: number;
  mode: 'mobile' | 'tablet' | 'desktop';
}

export function useViewport(): ViewportSnapshot {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, svh: 0, lvh: 0, dvh: 0, mode: 'desktop' };
  }
  const width = window.innerWidth;
  const innerH = window.innerHeight;
  const dvh = window.visualViewport?.height ?? innerH;
  return {
    width,
    height: innerH,
    svh: Math.min(innerH, dvh),
    lvh: innerH,
    dvh,
    mode: width < 768 ? 'mobile' : width < 1280 ? 'tablet' : 'desktop',
  };
}
