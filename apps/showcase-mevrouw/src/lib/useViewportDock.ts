import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export function useViewportDock() {
  const lastY = useRef(0);
  const [compact, setCompact] = useState(false);
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;
    let settleTimer = 0;

    const updateInset = () => {
      const nextInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setBottomInset(Math.round(nextInset));
    };

    const updateScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      lastY.current = y;
      if (y < 16 || delta < -8) setCompact(false);
      if (delta > 8) setCompact(true);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(updateInset, 120);
    };

    updateInset();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateInset);
    viewport?.addEventListener('resize', updateInset);
    viewport?.addEventListener('scroll', updateInset);
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateInset);
      viewport?.removeEventListener('resize', updateInset);
      viewport?.removeEventListener('scroll', updateInset);
    };
  }, []);

  return useMemo(() => ({
    className: compact ? 'dock-compact' : 'dock-expanded',
    style: {
      '--dock-bottom': `${bottomInset}px`,
      '--dock-reserve': 'calc(6.75rem + env(safe-area-inset-bottom, 0px))',
      '--dock-action-bottom': 'calc(var(--dock-bottom, 0px) + 6.75rem + env(safe-area-inset-bottom, 0px))',
      '--dock-nudge-bottom': 'calc(var(--dock-bottom, 0px) + 7rem + env(safe-area-inset-bottom, 0px))',
    } as CSSProperties,
  }), [bottomInset, compact]);
}
