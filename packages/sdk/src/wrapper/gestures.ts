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

export interface PressFeedbackOptions {
  selector?: string;
}

export interface GestureRoot {
  addEventListener: (...args: any[]) => void;
  removeEventListener: (...args: any[]) => void;
  ownerDocument?: { defaultView?: any } | null;
  defaultView?: any;
}

const DEFAULT_PRESS_SELECTOR =
  'button, [role="button"], a[href], input[type="button"], input[type="submit"], summary';

export function attachPressFeedback(
  root: GestureRoot | undefined = typeof document !== 'undefined' ? document : undefined,
  opts: PressFeedbackOptions = {},
): () => void {
  if (!root?.addEventListener) return () => {};
  const selector = opts.selector ?? DEFAULT_PRESS_SELECTOR;
  installPressFeedbackStyle();
  let active: Element | null = null;

  const release = () => {
    active?.removeAttribute('data-shippie-pressing');
    active = null;
  };
  const down = (e: Event) => {
    const source = e.target as { closest?: (selector: string) => Element | null } | null;
    const target = typeof source?.closest === 'function' ? source.closest(selector) : null;
    if (!target) return;
    active?.removeAttribute('data-shippie-pressing');
    active = target;
    target.setAttribute('data-shippie-pressing', 'true');
  };

  root.addEventListener('pointerdown', down);
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerleave', release);
  root.addEventListener('blur', release, true);

  return () => {
    release();
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointerup', release);
    root.removeEventListener('pointercancel', release);
    root.removeEventListener('pointerleave', release);
    root.removeEventListener('blur', release, true);
  };
}

export interface KeyboardAvoidanceOptions {
  delayMs?: number;
}

export function attachKeyboardAvoidance(
  root: GestureRoot | undefined = typeof document !== 'undefined' ? document : undefined,
  opts: KeyboardAvoidanceOptions = {},
): () => void {
  if (!root?.addEventListener) return () => {};
  const delayMs = opts.delayMs ?? 80;
  let timer: ReturnType<Window['setTimeout']> | null = null;
  const rootDocument = 'ownerDocument' in root ? root.ownerDocument : root;
  const timerWindow = rootDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);

  const focusIn = (e: Event) => {
    const target = isElementForKeyboard(e.target) ? e.target : null;
    if (!target || !isKeyboardTarget(target)) return;
    if (!timerWindow) return;
    if (timer !== null) timerWindow.clearTimeout(timer);
    timer = timerWindow.setTimeout(() => {
      try {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      } catch {
        target.scrollIntoView();
      }
    }, delayMs);
  };

  root.addEventListener('focusin', focusIn);
  return () => {
    if (timer !== null) timerWindow?.clearTimeout(timer);
    root.removeEventListener('focusin', focusIn);
  };
}

function isElementForKeyboard(value: EventTarget | null): value is HTMLElement {
  const maybe = value as HTMLElement | null;
  return !!maybe && typeof maybe.tagName === 'string' && typeof maybe.getAttribute === 'function';
}

function isKeyboardTarget(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  const type = (el.getAttribute('type') ?? 'text').toLowerCase();
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
}

function installPressFeedbackStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-shippie-press-feedback]')) return;
  const style = document.createElement('style');
  style.dataset.shippiePressFeedback = 'true';
  style.textContent = `
@media (prefers-reduced-motion: no-preference) {
  [data-shippie-pressing="true"] {
    transform: scale(.985);
    opacity: .86;
    transition: transform 90ms ease, opacity 90ms ease;
  }
}
`;
  document.head.append(style);
}
