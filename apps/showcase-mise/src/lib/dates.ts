/**
 * Mise — local-time date helpers. Day boundaries follow the user's
 * clock so "today" matches what they'd expect.
 */

export function dayKey(iso: string | number | Date): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKey(now);
}

export function addDays(iso: string | number | Date, days: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d;
}

export function sameDay(a: string | number | Date, b: string | number | Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** Distinct day keys for the last `n` days ending today (most recent first). */
export function lastNDayKeys(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) keys.push(dayKey(addDays(now, -i)));
  return keys;
}
