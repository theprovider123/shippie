/**
 * Kick-off localisation. Fixture times are stored as UK kick-off (GMT in the
 * design's data); the picker cycles a small set of fan timezones. A tiny
 * external store lets every subscribed component re-render on change.
 */
import { useSyncExternalStore } from 'react';

export interface TZOption {
  id: string;
  label: string;
  offset: number;
}

export const TZ_OPTIONS: TZOption[] = [
  { id: 'BST', label: 'BST', offset: 1 },
  { id: 'GMT', label: 'GMT', offset: 0 },
  { id: 'CET', label: 'CET', offset: 2 },
  { id: 'ET', label: 'ET', offset: -4 },
  { id: 'PT', label: 'PT', offset: -7 },
  { id: 'IST', label: 'IST', offset: 5.5 },
  { id: 'AEST', label: 'AEST', offset: 10 },
];

export function detectTZ(offsetHours?: number): string {
  const off = offsetHours ?? -new Date().getTimezoneOffset() / 60;
  if (off === 1) return 'BST';
  if (off === 2) return 'CET';
  if (off === -4) return 'ET';
  if (off === -7) return 'PT';
  if (Math.abs(off - 5.5) < 0.1) return 'IST';
  if (off === 10) return 'AEST';
  return 'GMT';
}

const TZ_KEY = 'cannon_tz';

let current: string = (() => {
  try {
    return localStorage.getItem(TZ_KEY) || detectTZ();
  } catch {
    return 'BST';
  }
})();

const listeners = new Set<() => void>();

export function getTZ(): string {
  return current;
}

export function setTZ(id: string): void {
  current = id;
  try {
    localStorage.setItem(TZ_KEY, id);
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

export function cycleTZ(): string {
  const ids = TZ_OPTIONS.map((t) => t.id);
  const next = TZ_OPTIONS[(ids.indexOf(current) + 1) % ids.length].id;
  setTZ(next);
  return next;
}

export function useTZ(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function localiseMatchTime(hmGMT: string, tzId: string = current): string {
  const tz = TZ_OPTIONS.find((t) => t.id === tzId) ?? { id: 'BST', offset: 1 };
  const [h, m] = hmGMT.split(':').map(Number);
  const total = h + tz.offset;
  const lh = Math.floor(((total % 24) + 24) % 24);
  const lm = m + Math.round((total - Math.floor(total)) * 60);
  const mm = lm >= 60 ? lm - 60 : lm;
  const hh = lm >= 60 ? (lh + 1) % 24 : lh;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${tzId}`;
}
