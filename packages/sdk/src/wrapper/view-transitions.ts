// packages/sdk/src/wrapper/view-transitions.ts
/**
 * Thin wrapper around the View Transitions API.
 *
 * Feature-detects `document.startViewTransition` and falls back to a
 * plain callback invocation when unsupported (Safari <18.2 and older
 * Firefox). Callers never need to branch on support themselves.
 */

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
  const vt = (document as DocumentWithViewTransition).startViewTransition!(update);
  try {
    await vt.finished;
  } finally {
    if (previous) root.dataset.shippieTransition = previous;
    else delete root.dataset.shippieTransition;
  }
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
