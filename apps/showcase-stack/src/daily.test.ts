import { test, expect } from 'bun:test';
import { todayKeyUTC, dailySeed, puzzleId, rollStreak, shareStackResult } from './daily';

test('todayKeyUTC uses the UTC day boundary', () => {
  expect(todayKeyUTC(new Date('2026-06-04T23:30:00Z'))).toBe('2026-06-04');
});

test('dailySeed + puzzleId stable and versioned', () => {
  expect(dailySeed('stack', '2026-06-04')).toBe(dailySeed('stack', '2026-06-04'));
  expect(dailySeed('stack', '2026-06-04')).not.toBe(dailySeed('stack', '2026-06-05'));
  expect(puzzleId('stack', '2026-06-04')).toBe('stack-2026-06-04-r1-c1');
});

test('rollStreak counts consecutive days; gap breaks current, keeps best', () => {
  expect(rollStreak(['2026-06-02', '2026-06-03', '2026-06-04'], '2026-06-04')).toEqual({ current: 3, best: 3 });
  const r = rollStreak(['2026-05-01', '2026-05-02', '2026-05-03', '2026-06-04'], '2026-06-04');
  expect(r.current).toBe(1);
  expect(r.best).toBe(3);
});

test('shareStackResult renders score, lines, date, url', () => {
  const out = shareStackResult({ puzzleId: 'stack-2026-06-04-r1-c1', score: 12500, lines: 42 });
  expect(out).toContain('2026-06-04');
  expect(out).toContain('12,500');
  expect(out).toContain('42 lines');
  expect(out).toContain('shippie.app/run/stack/');
});
