/**
 * useKeyboard — origin-safe SDK helper that signals the parent Shippie
 * shell when the on-screen keyboard rises/falls inside this tool's
 * iframe. The parent uses these signals to step its chrome (e.g. the
 * focused-exit-pill) out of the keyboard's way.
 *
 * Why this helper exists:
 *   Parent-side `visualViewport` listening doesn't reliably observe
 *   focus events inside cross-origin iframes — the parent can see its
 *   own viewport collapse, but it can't tell which frame caused it,
 *   so it can't decide whose chrome to adapt. The cleanest fix is a
 *   namespaced postMessage contract: the tool announces "keyboard
 *   open" when one of its inputs gains focus, and "keyboard closed"
 *   when the keyboard recedes.
 *
 * Security model:
 *   - We post to the SPECIFIC parent origin (derived from
 *     `document.referrer`), never `*` in production. Without a known
 *     referrer the helper short-circuits.
 *   - Message types are namespaced as `shippie:tool-keyboard-open`
 *     and `shippie:tool-keyboard-close` so the parent's filter can
 *     reject anything else.
 *   - The parent additionally validates `event.source` against the
 *     active iframe's `contentWindow` and `event.origin` against
 *     the slug's expected origin. The 4-step validation lives in
 *     `apps/platform/src/routes/container/+page.svelte`.
 *
 * Usage:
 *   import { useKeyboard } from '@shippie/sdk/wrapper/use-keyboard';
 *   const stop = useKeyboard();   // call once at tool boot
 *   // ...
 *   stop();                       // optional: stop signalling
 */

const TYPE_OPEN = 'shippie:tool-keyboard-open';
const TYPE_CLOSE = 'shippie:tool-keyboard-close';

// If the visible viewport shrinks by ≥this many CSS px relative to the
// layout viewport, treat it as a keyboard event. Smaller deltas are
// usually just URL-bar collapses on mobile browsers.
const KEYBOARD_DELTA_PX = 100;

export interface UseKeyboardOptions {
  /**
   * Override the parent origin (e.g. for testing). In production,
   * leave undefined — the helper derives it from `document.referrer`.
   */
  targetOrigin?: string;
}

/**
 * Returns a teardown function. Calling it removes all listeners.
 * Returns a no-op teardown if the helper short-circuits (no window,
 * no visualViewport, no parent origin).
 */
export function useKeyboard(options: UseKeyboardOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!window.visualViewport) return () => {};
  if (window.parent === window) return () => {}; // not in an iframe

  const targetOrigin = (() => {
    if (options.targetOrigin) return options.targetOrigin;
    try {
      return document.referrer ? new URL(document.referrer).origin : null;
    } catch {
      return null;
    }
  })();
  if (!targetOrigin) return () => {};

  let lastIsOpen = false;

  const post = (type: string, payload?: { height: number }) => {
    try {
      window.parent?.postMessage({ type, ...payload }, targetOrigin);
    } catch {
      // Cross-origin postMessage can throw if the parent navigated
      // mid-call. Silent — we'll try again on the next event.
    }
  };

  const onResize = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const layoutH = window.innerHeight;
    const visibleH = vv.height;
    const delta = layoutH - visibleH;
    const isOpen = delta >= KEYBOARD_DELTA_PX;
    if (isOpen === lastIsOpen) return;
    lastIsOpen = isOpen;
    if (isOpen) post(TYPE_OPEN, { height: delta });
    else post(TYPE_CLOSE);
  };

  // Pre-emptive: when an input gains focus, signal open immediately
  // (before visualViewport fires). Parent can hide chrome before the
  // keyboard has fully animated in. Height = 0 is intentional — the
  // resize handler will refine it on the next tick.
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.matches('input, textarea, [contenteditable], select')) {
      if (lastIsOpen) return;
      lastIsOpen = true;
      post(TYPE_OPEN, { height: 0 });
    }
  };

  window.visualViewport.addEventListener('resize', onResize);
  document.addEventListener('focusin', onFocusIn);

  return () => {
    window.visualViewport?.removeEventListener('resize', onResize);
    document.removeEventListener('focusin', onFocusIn);
  };
}
