import { describe, expect, test } from 'bun:test';
import {
  addDays,
  bestStreak,
  buildHeatmap,
  currentStreak,
  dayKey,
  statusForDay,
} from './streak-math.ts';
import type { HabitCheck } from '../types.ts';

const habit = { id: 'h1', createdAt: '2026-01-01T00:00:00Z' };

function check(day: string, status: 'done' | 'partial' | 'missed' = 'done'): HabitCheck {
  return {
    id: `c_${day}_${status}`,
    habitId: 'h1',
    checkedAt: `${day}T08:00:00Z`,
    status,
    source: 'manual',
  };
}

describe('streak-math — day arithmetic', () => {
  test('dayKey extracts ISO day from a Date', () => {
    expect(dayKey(new Date('2026-04-28T15:30:00Z'))).toBe('2026-04-28');
  });

  test('addDays moves forward and backward stably across months', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-04-28', 7)).toBe('2026-05-05');
  });
});

describe('streak-math — statusForDay', () => {
  test('returns done when any check that day is done', () => {
    const checks = [check('2026-04-28', 'partial'), check('2026-04-28', 'done')];
    expect(statusForDay('h1', '2026-04-28', checks)).toBe('done');
  });

  test('returns partial when only partial checks exist', () => {
    expect(statusForDay('h1', '2026-04-28', [check('2026-04-28', 'partial')])).toBe('partial');
  });

  test('returns null when no record exists', () => {
    expect(statusForDay('h1', '2026-04-28', [])).toBeNull();
  });

  test('ignores other habits checks', () => {
    const checks: HabitCheck[] = [
      {
        id: 'c1',
        habitId: 'h2',
        checkedAt: '2026-04-28T08:00:00Z',
        status: 'done',
        source: 'manual',
      },
    ];
    expect(statusForDay('h1', '2026-04-28', checks)).toBeNull();
  });
});

describe('streak-math — currentStreak', () => {
  test('counts consecutive done days back from today', () => {
    const checks = [
      check('2026-04-28'),
      check('2026-04-27'),
      check('2026-04-26'),
    ];
    expect(currentStreak('h1', '2026-04-28', checks)).toBe(3);
  });

  test('partial counts toward streak (anti-punishment)', () => {
    const checks = [check('2026-04-28', 'done'), check('2026-04-27', 'partial')];
    expect(currentStreak('h1', '2026-04-28', checks)).toBe(2);
  });

  test('breaks at the first missing day', () => {
    const checks = [
      check('2026-04-28'),
      // 04-27 missing
      check('2026-04-26'),
    ];
    expect(currentStreak('h1', '2026-04-28', checks)).toBe(1);
  });

  test('returns 0 when today has no record', () => {
    expect(currentStreak('h1', '2026-04-28', [check('2026-04-27')])).toBe(0);
  });
});

describe('streak-math — bestStreak', () => {
  test('finds the longest historical run', () => {
    const checks = [
      check('2026-01-10'),
      check('2026-01-11'),
      check('2026-01-12'),
      // gap
      check('2026-02-01'),
      check('2026-02-02'),
    ];
    expect(bestStreak('h1', checks)).toBe(3);
  });

  test('returns 0 with no active days', () => {
    expect(bestStreak('h1', [])).toBe(0);
  });
});

describe('streak-math — buildHeatmap', () => {
  test('emits null cells for days before habit creation', () => {
    const cells = buildHeatmap(habit, '2026-01-03', [], 5);
    expect(cells.length).toBe(5);
    // first cells (2025-12-30..2025-12-31) should be null since habit was created 2026-01-01
    expect(cells[0]!.status).toBeNull();
    expect(cells[1]!.status).toBeNull();
  });

  test('paints status for active days', () => {
    const checks = [check('2026-01-02', 'done'), check('2026-01-03', 'partial')];
    const cells = buildHeatmap(habit, '2026-01-03', checks, 3);
    // cells: [2026-01-01, 2026-01-02, 2026-01-03]
    expect(cells[0]!.status).toBeNull();
    expect(cells[1]!.status).toBe('done');
    expect(cells[2]!.status).toBe('partial');
  });

  test('produces a 365-cell year by default', () => {
    expect(buildHeatmap(habit, '2026-04-28', []).length).toBe(365);
  });
});
