/**
 * Notification Center inbox (Tranche 2).
 *
 * On-device inbox of notifications Shippie or any showcase emits.
 * Persists in localStorage so the user can find what was shown even
 * after the toast/banner is gone. Honors Quiet Hours via
 * `inQuietHours()` from preferences.
 *
 * Push delivery (VAPID) is unchanged; this layer is purely the
 * user-readable record of what was delivered.
 */

import { inQuietHours, loadPreferences, type SystemPreferences } from './preferences.ts';

export interface InboxNotification {
  id: string;
  appSlug: string;
  title: string;
  body?: string;
  ts: number;
  /** Optional deeplink to open the originating app context. */
  deeplink?: string;
  /** True when the user opened or dismissed it. */
  read: boolean;
  /** True when Quiet Hours suppressed the live toast. */
  suppressedByQuietHours?: boolean;
}

const KEY = 'shippie.notification-inbox.v1';
const INBOX_CAP = 200;

function safeParse(raw: string | null): InboxNotification[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as InboxNotification[];
  } catch {
    /* fall through */
  }
  return [];
}

export function listInbox(storage: Storage = globalThis.localStorage): InboxNotification[] {
  if (!storage) return [];
  return safeParse(storage.getItem(KEY)).sort((a, b) => b.ts - a.ts);
}

export function pushToInbox(
  notification: Omit<InboxNotification, 'read' | 'suppressedByQuietHours'>,
  opts: { storage?: Storage; prefs?: SystemPreferences; now?: () => Date } = {},
): InboxNotification {
  const storage = opts.storage ?? globalThis.localStorage;
  const prefs = opts.prefs ?? loadPreferences(storage);
  const now = opts.now ?? (() => new Date());
  const t = now();
  const hhmm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const suppressed = inQuietHours(prefs, hhmm);
  const record: InboxNotification = {
    ...notification,
    read: false,
    suppressedByQuietHours: suppressed,
  };
  if (!storage) return record;
  const all = listInbox(storage);
  all.unshift(record);
  if (all.length > INBOX_CAP) all.length = INBOX_CAP;
  storage.setItem(KEY, JSON.stringify(all));
  return record;
}

export function markRead(id: string, storage: Storage = globalThis.localStorage): void {
  if (!storage) return;
  const all = listInbox(storage).map((n) => (n.id === id ? { ...n, read: true } : n));
  storage.setItem(KEY, JSON.stringify(all));
}

export function markAllRead(storage: Storage = globalThis.localStorage): void {
  if (!storage) return;
  const all = listInbox(storage).map((n) => ({ ...n, read: true }));
  storage.setItem(KEY, JSON.stringify(all));
}

export function clearInbox(storage: Storage = globalThis.localStorage): void {
  if (!storage) return;
  storage.removeItem(KEY);
}

export function unreadCount(storage: Storage = globalThis.localStorage): number {
  return listInbox(storage).filter((n) => !n.read).length;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
