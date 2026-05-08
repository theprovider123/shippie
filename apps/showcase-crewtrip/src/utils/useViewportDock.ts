import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

export function useViewportDock() {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;
    let settleTimer = 0;

    const updateInset = () => {
      const activeElement = document.activeElement;
      const keyboardLikelyOpen = activeElement instanceof HTMLElement
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)
        && viewport
        && window.innerHeight - viewport.height > 150;
      const nextInset = keyboardLikelyOpen && viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setBottomInset(Math.round(nextInset));
    };

    const updateScroll = () => {
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
    className: 'dock-expanded',
    style: {
      '--dock-bottom': `${bottomInset}px`,
      '--dock-reserve': 'calc(126px + env(safe-area-inset-bottom, 0px))',
      '--dock-action-bottom': 'calc(var(--dock-bottom, 0px) + 118px + env(safe-area-inset-bottom, 0px))',
    } as CSSProperties,
  }), [bottomInset]);
}
