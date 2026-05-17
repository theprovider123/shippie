import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

export function useViewportDock() {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;
    let settleTimer = 0;
    let frame = 0;

    const updateInset = () => {
      frame = 0;
      const activeElement = document.activeElement;
      const keyboardLikelyOpen = activeElement instanceof HTMLElement
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)
        && viewport
        && window.innerHeight - viewport.height > 150;
      const nextInset = keyboardLikelyOpen && viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setBottomInset((current) => {
        const rounded = Math.round(nextInset);
        return current === rounded ? current : rounded;
      });
    };

    const scheduleUpdate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateInset);
    };

    const settleUpdate = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(scheduleUpdate, 80);
    };

    updateInset();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('focusin', settleUpdate);
    window.addEventListener('focusout', settleUpdate);
    viewport?.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('scroll', scheduleUpdate);
    return () => {
      window.clearTimeout(settleTimer);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('focusin', settleUpdate);
      window.removeEventListener('focusout', settleUpdate);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
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
