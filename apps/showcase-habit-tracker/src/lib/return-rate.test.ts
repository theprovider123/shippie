import { describe, expect, test } from 'bun:test';
import { returnPhrase, returnStats } from './return-rate.ts';
import type { HabitCheck } from '../types.ts';

function check(day: string, status: 'done' | 'partial' | 'missed' = 'done'): HabitCheck {
  return {
    id: `c_${day}_${status}`,
    habitId: 'h1',
    checkedAt: `${day}T08:00:00Z`,
    status,
    source: 'manual',
  };
}

describe('return-rate — returnStats', () => {
  test('counts active days within window', () => {
    const checks = [check('2026-04-28'), check('2026-04-27'), check('2026-04-22')];
    const s = returnStats('h1', '2026-04-28', checks, 28);
    expect(s.activeDays).toBe(3);
    expect(s.windowDays).toBe(28);
  });

  test('treats partial as active', () => {
    const checks = [check('2026-04-28', 'partial')];
    expect(returnStats('h1', '2026-04-28', checks, 7).activeDays).toBe(1);
  });

  test('counts a return after a one-day gap', () => {
    // active, gap, active → one return
    const checks = [check('2026-04-28'), check('2026-04-26')];
    const s = returnStats('h1', '2026-04-28', checks, 7);
    expect(s.returns).toBe(1);
  });

  test('counts multiple returns across the window', () => {
    // Pattern: active, gap, active, gap, active → 2 returns
    const checks = [check('2026-04-28'), check('2026-04-26'), check('2026-04-24')];
    const s = returnStats('h1', '2026-04-28', checks, 7);
    expect(s.returns).toBe(2);
  });

  test('continuous activity yields zero returns (nothing to return from)', () => {
    const checks = [
      check('2026-04-28'),
      check('2026-04-27'),
      check('2026-04-26'),
      check('2026-04-25'),
    ];
    expect(returnStats('h1', '2026-04-28', checks, 7).returns).toBe(0);
  });

  test('daysPerWeek is rounded to one decimal', () => {
    const checks = [check('2026-04-28'), check('2026-04-26'), check('2026-04-24')];
    const s = returnStats('h1', '2026-04-28', checks, 7);
    // 3 active days / 7 day window * 7 = 3.0
    expect(s.daysPerWeek).toBe(3);
  });

  test('zero history yields zero everything', () => {
    const s = returnStats('h1', '2026-04-28', [], 28);
    expect(s.activeDays).toBe(0);
    expect(s.returns).toBe(0);
    expect(s.daysPerWeek).toBe(0);
  });
});

describe('return-rate — returnPhrase', () => {
  test('"no days yet" when never active', () => {
    expect(returnPhrase({ activeDays: 0, windowDays: 28, returns: 0, daysPerWeek: 0 })).toBe(
      'no days yet',
    );
  });

  test('"most days" when daysPerWeek is at the high end', () => {
    expect(returnPhrase({ activeDays: 27, windowDays: 28, returns: 1, daysPerWeek: 6.7 })).toBe(
      'most days',
    );
  });

  test('plain "~N days a week" otherwise', () => {
    expect(returnPhrase({ activeDays: 12, windowDays: 28, returns: 4, daysPerWeek: 3 })).toBe(
      '~3 days a week',
    );
  });
});
