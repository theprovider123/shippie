import { test, expect, beforeEach } from 'vitest';
import { todayKeyUTC, rollStreak, loadStreak, recordPlayToday, puzzleId } from './daily';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

test('todayKeyUTC uses the UTC day boundary', () => {
  expect(todayKeyUTC(new Date('2026-06-04T23:30:00Z'))).toBe('2026-06-04');
});

test('puzzleId is versioned', () => {
  expect(puzzleId('topbins', '2026-06-04')).toBe('topbins-2026-06-04-r1-c1');
});

test('rollStreak counts consecutive UTC days; gap keeps best', () => {
  expect(rollStreak(['2026-06-02', '2026-06-03', '2026-06-04'], '2026-06-04')).toEqual({ current: 3, best: 3 });
  const r = rollStreak(['2026-05-01', '2026-05-02', '2026-05-03', '2026-06-04'], '2026-06-04');
  expect(r.current).toBe(1);
  expect(r.best).toBe(3);
});

test('recordPlayToday is idempotent within a day and persists', () => {
  const a = recordPlayToday({ completedDates: [], best: 0 });
  expect(a.completedDates).toContain(todayKeyUTC());
  const b = recordPlayToday(a);
  expect(b.completedDates.length).toBe(a.completedDates.length); // same day → no double count
  expect(loadStreak().completedDates).toContain(todayKeyUTC());
});
