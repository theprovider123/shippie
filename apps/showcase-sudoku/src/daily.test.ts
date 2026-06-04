import { test, expect, beforeEach } from 'bun:test';
import {
  todayKeyUTC,
  dailySeed,
  puzzleId,
  rollStreak,
  loadSave,
  writeSave,
  shareResult,
} from './daily';

// minimal localStorage shim for the save/resume tests
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
  expect(todayKeyUTC(new Date('2026-06-05T00:01:00Z'))).toBe('2026-06-05');
});

test('dailySeed + puzzleId are stable and versioned', () => {
  expect(dailySeed('sudoku', '2026-06-04')).toBe(dailySeed('sudoku', '2026-06-04'));
  expect(dailySeed('sudoku', '2026-06-04')).not.toBe(dailySeed('sudoku', '2026-06-05'));
  expect(puzzleId('sudoku', '2026-06-04')).toBe('sudoku-2026-06-04-r1-c1');
});

test('rollStreak counts consecutive UTC days', () => {
  expect(rollStreak(['2026-06-02', '2026-06-03', '2026-06-04'], '2026-06-04')).toEqual({ current: 3, best: 3 });
});

test('a gap breaks current but keeps best', () => {
  const r = rollStreak(['2026-05-01', '2026-05-02', '2026-05-03', '2026-06-03', '2026-06-04'], '2026-06-04');
  expect(r.current).toBe(2);
  expect(r.best).toBe(3);
});

test('a missed today keeps the streak earned through yesterday', () => {
  expect(rollStreak(['2026-06-02', '2026-06-03'], '2026-06-04').current).toBe(2);
});

test('save/resume round-trips, and corrupt data is treated as fresh', () => {
  writeSave('k', { puzzleId: 'sudoku-2026-06-04-r1-c1', payloadVersion: 1, payload: { board: [1, 2, 3] } });
  expect(loadSave<{ board: number[] }>('k')?.payload.board).toEqual([1, 2, 3]);
  localStorage.setItem('bad', '{not json');
  expect(loadSave('bad')).toBeNull();
  expect(loadSave('missing')).toBeNull();
});

test('shareResult renders time + hints + url', () => {
  const out = shareResult({ puzzleId: 'sudoku-2026-06-04-r1-c1', seconds: 312, hintsUsed: 1 });
  expect(out).toContain('2026-06-04');
  expect(out).toContain('5:12');
  expect(out).toContain('1 hint');
  expect(out).toContain('shippie.app/run/sudoku/');
});
