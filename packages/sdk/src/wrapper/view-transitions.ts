// packages/sdk/src/wrapper/view-transitions.ts
/**
 * Thin wrapper around the View Transitions API.
 *
 * Feature-detects `document.startViewTransition` and falls back to a
 * plain callback invocation when unsupported (Safari <18.2 and older
 * Firefox). Callers never need to branch on support themselves.
 */

import { reportAppNavigation } from './lifecycle.ts';

interface ViewTransitionLike {
  finished: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionLike;
};

export type ViewTransitionKind = 'slide' | 'expand' | 'rise' | 'crossfade';

export interface ViewTransitionOptions {
  kind?: ViewTransitionKind;
  durationMs?: number;
}

export interface LocalNavigationOptions<T> {
  /**
   * Optional equality check used to avoid pushing duplicate entries.
   * Defaults to `Object.is`, which is fine for primitive tab ids.
   */
  isEqual?: (a: T, b: T) => boolean;
}

export interface LocalNavigateOptions extends ViewTransitionOptions {
  /**
   * `push` is for forward movement into a local screen. `replace`
   * updates the current local entry, useful after saves. `none` just
   * applies the state and reports whether existing history can go back.
   */
  history?: 'push' | 'replace' | 'none';
}

export interface LocalNavigationController<T> {
  current: () => T;
  canGoBack: () => boolean;
  navigate: (next: T, opts?: LocalNavigateOptions) => Promise<void>;
  replace: (next: T, opts?: ViewTransitionOptions) => Promise<void>;
  back: () => boolean;
  backOrReplace: (fallback: T, opts?: ViewTransitionOptions) => Promise<'back' | 'replace'>;
  destroy: () => void;
}

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition === 'function';
}

export function installViewTransitionStyles(opts: ViewTransitionOptions = {}): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.querySelector<HTMLStyleElement>('style[data-shippie-view-transitions]');
  if (existing) return existing;
  const style = document.createElement('style');
  style.dataset.shippieViewTransitions = 'true';
  style.textContent = viewTransitionCss(opts.durationMs ?? 150);
  document.head.append(style);
  return style;
}

export async function wrapNavigation(
  update: () => void | Promise<void>,
  opts: ViewTransitionOptions = {},
): Promise<void> {
  if (!supportsViewTransitions()) {
    await update();
    return;
  }
  installViewTransitionStyles(opts);
  const root = document.documentElement;
  const previous = root.dataset.shippieTransition;
  root.dataset.shippieTransition = opts.kind ?? 'slide';
  // Fire the navigate texture in the same frame as the transition starts.
  // Lazy-import to avoid a hard dep cycle (textures import view-transitions
  // indirectly through visual-fx).
  void import('./textures/engine.ts')
    .then(({ fireTexture }) => {
      try {
        fireTexture('navigate', document.body);
      } catch {
        /* swallow — navigate texture may not be registered in some test envs */
      }
    })
    .catch(() => {
      /* swallow */
    });
  const vt = (document as DocumentWithViewTransition).startViewTransition!(update);
  try {
    await vt.finished;
  } finally {
    if (previous) root.dataset.shippieTransition = previous;
    else delete root.dataset.shippieTransition;
  }
}

/**
 * Framework-agnostic local navigation stack for apps whose "pages" are
 * React/Svelte/Vue state instead of real URLs.
 *
 * It pushes a small browser-history marker on forward navigation, then
 * re-applies the previous app state on `popstate`. The wrapper's
 * observe bootstrap still owns shell messages and page-view emission;
 * this helper makes the app-local state actually follow that history.
 */
export function createLocalNavigation<T>(
  initial: T,
  apply: (state: T) => void | Promise<void>,
  opts: LocalNavigationOptions<T> = {},
): LocalNavigationController<T> {
  const id = `shippie-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const isEqual = opts.isEqual ?? Object.is;
  let stack: T[] = [initial];
  let index = 0;
  let destroyed = false;
  let applyingFromPopstate = false;

  function current() {
    return stack[index] ?? initial;
  }

  function canGoBack() {
    return index > 0;
  }

  function stateFor(depth: number) {
    return { __shippieLocalNavigation: { id, depth } };
  }

  function postState() {
    reportAppNavigation({ canGoBack: canGoBack(), navDepth: index });
    try {
      if (typeof window === 'undefined' || window.parent === window) return;
      window.parent.postMessage(
        { type: 'shippie:navigation-state', canGoBack: canGoBack() },
        '*',
      );
    } catch {
      /* parent may be unavailable */
    }
  }

  async function applyWithTransition(next: T, transition: ViewTransitionOptions = {}) {
    await wrapNavigation(() => apply(next), transition);
  }

  function replaceBrowserState(depth: number) {
    if (typeof history === 'undefined') return;
    try {
      history.replaceState(stateFor(depth), '', typeof location === 'undefined' ? undefined : location.href);
    } catch {
      /* ignore history failures */
    }
  }

  async function navigate(next: T, navOpts: LocalNavigateOptions = {}) {
    if (destroyed) return;
    const historyMode = navOpts.history ?? 'push';
    const { history: _history, ...transition } = navOpts;
    if (isEqual(current(), next)) {
      postState();
      return;
    }

    await applyWithTransition(next, transition);

    if (historyMode === 'replace') {
      stack[index] = next;
      replaceBrowserState(index);
      postState();
      return;
    }

    if (historyMode === 'none') {
      stack[index] = next;
      postState();
      return;
    }

    stack = stack.slice(0, index + 1);
    stack.push(next);
    index = stack.length - 1;
    try {
      if (typeof history !== 'undefined') history.pushState(stateFor(index), '', null);
    } catch {
      /* ignore history failures; the app still moved */
    }
    postState();
  }

  async function replace(next: T, transition: ViewTransitionOptions = {}) {
    await navigate(next, { ...transition, history: 'replace' });
  }

  function back() {
    if (destroyed || index <= 0) {
      postState();
      return false;
    }
    try {
      if (typeof history !== 'undefined') {
        history.back();
        return true;
      }
    } catch {
      /* fall through to synchronous fallback */
    }
    void applyPopstateDepth(index - 1);
    return true;
  }

  async function backOrReplace(fallback: T, transition: ViewTransitionOptions = {}) {
    if (back()) return 'back';
    await replace(fallback, transition);
    return 'replace';
  }

  async function applyPopstateDepth(targetDepth: number) {
    if (destroyed || applyingFromPopstate) return;
    const bounded = Math.max(0, Math.min(targetDepth, stack.length - 1));
    if (bounded === index) {
      postState();
      return;
    }
    applyingFromPopstate = true;
    index = bounded;
    try {
      await applyWithTransition(current(), { kind: 'crossfade' });
    } finally {
      applyingFromPopstate = false;
      postState();
    }
  }

  function depthFromState(state: unknown): number | null {
    const record = state as { __shippieLocalNavigation?: { id?: unknown; depth?: unknown } } | null;
    const marker = record?.__shippieLocalNavigation;
    if (!marker || marker.id !== id || typeof marker.depth !== 'number') return null;
    return marker.depth;
  }

  function handlePopstate(event: PopStateEvent) {
    if (destroyed || index <= 0) {
      postState();
      return;
    }
    const markedDepth = depthFromState(event.state);
    const targetDepth = markedDepth ?? index - 1;
    void applyPopstateDepth(targetDepth);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', handlePopstate);
    queueMicrotask(postState);
  }

  return {
    current,
    canGoBack,
    navigate,
    replace,
    back,
    backOrReplace,
    destroy: () => {
      destroyed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', handlePopstate);
      }
    },
  };
}

function viewTransitionCss(durationMs: number): string {
  return `
@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: ${durationMs}ms;
    animation-timing-function: cubic-bezier(.2, .8, .2, 1);
  }

  html[data-shippie-transition="slide"]::view-transition-old(root) {
    animation-name: shippie-slide-out;
  }
  html[data-shippie-transition="slide"]::view-transition-new(root) {
    animation-name: shippie-slide-in;
  }

  html[data-shippie-transition="rise"]::view-transition-new(root),
  html[data-shippie-transition="expand"]::view-transition-new(root) {
    animation-name: shippie-rise-in;
  }

  html[data-shippie-transition="crossfade"]::view-transition-old(root),
  html[data-shippie-transition="crossfade"]::view-transition-new(root) {
    animation-name: shippie-crossfade;
  }

  @keyframes shippie-slide-in {
    from { transform: translateX(24px); opacity: .96; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes shippie-slide-out {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(-16px); opacity: .92; }
  }
  @keyframes shippie-rise-in {
    from { transform: translateY(18px) scale(.985); opacity: .94; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }
  @keyframes shippie-crossfade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
`;
}
