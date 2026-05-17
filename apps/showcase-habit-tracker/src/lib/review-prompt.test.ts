import { describe, expect, test } from 'bun:test';
import {
  isoWeekLabel,
  rampWarning,
  reviewLines,
  weekStart,
  weekStatsForHabits,
} from './review-prompt.ts';
import type { Habit, HabitCheck } from '../types.ts';

const today = '2026-04-29'; // Wednesday
const monday = '2026-04-27';

function habit(id: string, name: string, opts: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    difficulty: 'medium',
    createdAt: '2026-01-01T00:00:00Z',
    ...opts,
  };
}

function check(habitId: string, day: string): HabitCheck {
  return {
    id: `c_${habitId}_${day}`,
    habitId,
    checkedAt: `${day}T08:00:00Z`,
    status: 'done',
    source: 'manual',
  };
}

describe('review-prompt — week math', () => {
  test('weekStart returns the Monday of the week', () => {
    expect(weekStart('2026-04-29')).toBe(monday);
    expect(weekStart('2026-04-27')).toBe(monday);
    expect(weekStart('2026-05-03')).toBe(monday); // Sunday rolls back to Monday
  });

  test('isoWeekLabel produces YYYY-Www', () => {
    const label = isoWeekLabel('2026-04-29');
    expect(label).toMatch(/^2026-W\d{2}$/);
  });
});

describe('review-prompt — weekStatsForHabits', () => {
  test('counts active days for the current and previous week', () => {
    const h = habit('h1', 'Meditation');
    const checks = [
      // this week (Apr 27–May 03): three checks
      check('h1', '2026-04-27'),
      check('h1', '2026-04-28'),
      check('h1', '2026-04-29'),
      // last week (Apr 20–26): one check
      check('h1', '2026-04-22'),
    ];
    const [s] = weekStatsForHabits([h], today, checks);
    expect(s!.daysActive).toBe(3);
    expect(s!.daysActiveLastWeek).toBe(1);
    expect(s!.trend).toBe('up');
  });

  test('skips archived habits', () => {
    const h = habit('h1', 'Cold shower', { archivedAt: '2026-04-20T00:00:00Z' });
    const stats = weekStatsForHabits([h], today, []);
    expect(stats).toEqual([]);
  });

  test('flat trend when both weeks match', () => {
    const h = habit('h1', 'Floss');
    const checks = [check('h1', '2026-04-28'), check('h1', '2026-04-21')];
    const [s] = weekStatsForHabits([h], today, checks);
    expect(s!.trend).toBe('flat');
  });
});

describe('review-prompt — reviewLines', () => {
  test('celebrates a 7/7 week without praise inflation', () => {
    const lines = reviewLines([
      { habitId: 'h1', habitName: 'Meditation', daysActive: 7, daysActiveLastWeek: 7, trend: 'flat' },
    ]);
    expect(lines.some((l) => l.includes('every day this week'))).toBe(true);
  });

  test('names a soft drop without scolding', () => {
    const lines = reviewLines([
      { habitId: 'h1', habitName: 'Cold shower', daysActive: 1, daysActiveLastWeek: 4, trend: 'down' },
    ]);
    const drop = lines.find((l) => l.includes('Cold shower'));
    expect(drop).toContain('1/7');
    expect(drop).toContain('was 4');
    expect(drop).toContain('lower the target');
    // Voice-doc enforcement: no scolding language.
    for (const line of lines) {
      expect(line).not.toMatch(/broke|failed|crush|streak/i);
    }
  });

  test('falls back to plain N/7 when nothing else applies', () => {
    const lines = reviewLines([
      { habitId: 'h1', habitName: 'Walk', daysActive: 3, daysActiveLastWeek: 3, trend: 'flat' },
    ]);
    expect(lines).toEqual(['Walk: 3/7.']);
  });

  test('offers a phase-in option for two-week-low habits', () => {
    const lines = reviewLines([
      { habitId: 'h1', habitName: 'Run', daysActive: 0, daysActiveLastWeek: 1, trend: 'down' },
    ]);
    expect(lines.some((l) => l.includes('Smaller version, or pause?'))).toBe(true);
  });
});

describe('review-prompt — rampWarning', () => {
  test('warns when 3+ hard habits started in the last 14 days', () => {
    const recent = new Date().toISOString();
    const habits: Habit[] = [
      habit('h1', 'Run', { difficulty: 'hard', createdAt: recent }),
      habit('h2', 'Cold shower', { difficulty: 'hard', createdAt: recent }),
      habit('h3', 'No sugar', { difficulty: 'hard', createdAt: recent }),
    ];
    const w = rampWarning(habits);
    expect(w).toBeTruthy();
    expect(w).toContain('3 hard habits');
  });

  test('quiet when only one hard habit is starting', () => {
    const habits: Habit[] = [
      habit('h1', 'Run', { difficulty: 'hard', createdAt: new Date().toISOString() }),
    ];
    expect(rampWarning(habits)).toBeNull();
  });

  test('ignores hard habits older than 14 days', () => {
    const habits: Habit[] = [
      habit('h1', 'Run', { difficulty: 'hard', createdAt: '2026-01-01T00:00:00Z' }),
      habit('h2', 'Cold shower', { difficulty: 'hard', createdAt: '2026-01-01T00:00:00Z' }),
      habit('h3', 'No sugar', { difficulty: 'hard', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    expect(rampWarning(habits)).toBeNull();
  });
});
