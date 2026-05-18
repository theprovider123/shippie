// packages/sdk/src/wrapper/update-toast.ts
/**
 * Back-compat wrapper for the old "update ready" toast.
 *
 * Updates now apply silently: the service worker activates, then the
 * controllerchange path reloads the document. Keep this export so older
 * callers still work, but do not render a visible prompt.
 */

export interface UpdateToastProps {
  onReload: () => void;
}

const ATTR = 'data-shippie-update';
let reloadScheduled = false;

export function mountUpdateToast(props: UpdateToastProps): void {
  unmountUpdateToast();
  if (reloadScheduled) return;
  reloadScheduled = true;
  scheduleMicrotask(() => {
    reloadScheduled = false;
    props.onReload();
  });
}

export function unmountUpdateToast(): void {
  const el = document.querySelector(`[${ATTR}]`);
  if (el) el.remove();
}

function scheduleMicrotask(fn: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
    return;
  }
  setTimeout(fn, 0);
}
