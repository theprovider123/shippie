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

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition === 'function';
}

export async function wrapNavigation(update: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions()) {
    await update();
    return;
  }
  const vt = (document as DocumentWithViewTransition).startViewTransition!(update);
  await vt.finished;
}
