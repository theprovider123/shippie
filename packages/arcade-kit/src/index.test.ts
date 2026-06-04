import { test, expect, beforeEach } from 'bun:test';
import {
  mulberry32,
  djb2,
  todayKeyUTC,
  puzzleId,
  dailySeed,
  rollStreak,
  recordToday,
  loadSave,
  writeSave,
  loadStreak,
  writeStreak,
  shareLines,
  type PuzzleVersion,
} from './index';

const V: PuzzleVersion = { rules: 1, content: 1 };

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

test('mulberry32 is deterministic per seed', () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});

test('djb2 is stable', () => {
  expect(djb2('sudoku-2026-06-04-r1-c1')).toBe(djb2('sudoku-2026-06-04-r1-c1'));
});

test('todayKeyUTC uses the UTC day boundary', () => {
  expect(todayKeyUTC(new Date('2026-06-04T23:30:00Z'))).toBe('2026-06-04');
  expect(todayKeyUTC(new Date('2026-06-05T00:01:00Z'))).toBe('2026-06-05');
});

test('puzzleId + dailySeed are versioned and stable', () => {
  expect(puzzleId('sudoku', '2026-06-04', V)).toBe('sudoku-2026-06-04-r1-c1');
  expect(dailySeed('sudoku', '2026-06-04', V)).toBe(dailySeed('sudoku', '2026-06-04', V));
  expect(dailySeed('sudoku', '2026-06-04', V)).not.toBe(dailySeed('sudoku', '2026-06-04', { rules: 2, content: 1 }));
});

test('rollStreak: consecutive run, gap keeps best, missed-today keeps yesterday run', () => {
  expect(rollStreak(['2026-06-02', '2026-06-03', '2026-06-04'], '2026-06-04')).toEqual({ current: 3, best: 3 });
  const r = rollStreak(['2026-05-01', '2026-05-02', '2026-05-03', '2026-06-04'], '2026-06-04');
  expect(r.current).toBe(1);
  expect(r.best).toBe(3);
  expect(rollStreak(['2026-06-02', '2026-06-03'], '2026-06-04').current).toBe(2);
});

test('recordToday is pure + idempotent within a day', () => {
  const a = recordToday({ completedDates: [], best: 0 }, '2026-06-04');
  expect(a.completedDates).toEqual(['2026-06-04']);
  expect(a.best).toBe(1);
  const b = recordToday(a, '2026-06-04');
  expect(b).toBe(a); // unchanged reference → no double count
});

test('save/resume + streak persistence round-trip; corrupt is fresh', () => {
  writeSave('s', { puzzleId: 'sudoku-2026-06-04-r1-c1', payloadVersion: 1, payload: { board: [1, 2] } });
  expect(loadSave<{ board: number[] }>('s')?.payload.board).toEqual([1, 2]);
  writeStreak('st', { completedDates: ['2026-06-04'], best: 1 });
  expect(loadStreak('st')).toEqual({ completedDates: ['2026-06-04'], best: 1 });
  localStorage.setItem('bad', '{nope');
  expect(loadSave('bad')).toBeNull();
  expect(loadStreak('bad')).toEqual({ completedDates: [], best: 0 });
});

test('shareLines joins with newlines', () => {
  expect(shareLines(['a', 'b', 'c'])).toBe('a\nb\nc');
});
