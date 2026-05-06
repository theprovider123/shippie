/**
 * Browser notification helper. Wraps the Notification API behind a
 * permission gate and a setTimeout-based scheduler. The scheduler is
 * best-effort: it only fires while the page is open. For real "push at
 * the right moment" the container's service worker (Push API + VAPID)
 * is the source of truth — this module is the in-page fallback so the
 * showcase still feels alive when the SW path isn't wired.
 */

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifyStatus(): NotifyPermission {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission as NotifyPermission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    return result as NotifyPermission;
  } catch {
    return 'denied';
  }
}

export interface NotifyAt {
  fireAt: Date;
  title: string;
  body: string;
}

/**
 * Schedule a single in-page notification. Returns a cancel handle
 * (no-op if the timeout already fired). If permission isn't granted
 * the notification is silently skipped — call requestNotifyPermission
 * up-front from a user gesture.
 */
export function scheduleNotify(opts: NotifyAt): () => void {
  if (typeof window === 'undefined') return () => {};
  const ms = opts.fireAt.getTime() - Date.now();
  if (ms <= 0) {
    fire(opts);
    return () => {};
  }
  // Cap at 24h so a forgotten timer can't pile up.
  if (ms > 24 * 60 * 60 * 1000) return () => {};
  const handle = window.setTimeout(() => fire(opts), ms);
  return () => window.clearTimeout(handle);
}

function fire(opts: NotifyAt): void {
  if (notifyStatus() !== 'granted') return;
  try {
    new Notification(opts.title, {
      body: opts.body,
      tag: `dough.${opts.title}`,
    });
  } catch {
    /* swallow — notifications are decorative */
  }
}

/** Schedule many; returns a single cancel that clears them all. */
export function scheduleAll(events: ReadonlyArray<NotifyAt>): () => void {
  const cancels = events.map((e) => scheduleNotify(e));
  return () => cancels.forEach((c) => c());
}
