import { useEffect } from 'react';

const EDITABLE_SELECTOR = 'input:not([type="file"]):not([type="range"]), textarea, select';

function activeEditable(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.matches(EDITABLE_SELECTOR) ? active : null;
}

export function useFocusedFieldStability() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let anchor: { element: HTMLElement; top: number; at: number } | null = null;
    let frame = 0;

    const capture = () => {
      const element = activeEditable();
      if (!element) {
        anchor = null;
        return;
      }
      anchor = {
        element,
        top: element.getBoundingClientRect().top,
        at: performance.now(),
      };
    };

    const restore = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const current = activeEditable();
        if (!anchor || !current || current !== anchor.element) return;
        if (performance.now() - anchor.at > 1200) return;

        const nextTop = current.getBoundingClientRect().top;
        const delta = nextTop - anchor.top;
        if (Math.abs(delta) < 24) return;

        window.scrollBy({ top: delta, behavior: 'instant' });
        anchor = {
          element: current,
          top: current.getBoundingClientRect().top,
          at: performance.now(),
        };
      });
    };

    const captureThenRestore = () => {
      capture();
      restore();
    };

    window.addEventListener('focusin', captureThenRestore);
    window.addEventListener('beforeinput', capture, true);
    window.addEventListener('keydown', capture, true);
    window.addEventListener('input', restore, true);
    window.visualViewport?.addEventListener('resize', restore);
    window.visualViewport?.addEventListener('scroll', restore);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('focusin', captureThenRestore);
      window.removeEventListener('beforeinput', capture, true);
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('input', restore, true);
      window.visualViewport?.removeEventListener('resize', restore);
      window.visualViewport?.removeEventListener('scroll', restore);
    };
  }, []);
}
