import { describe, expect, it } from 'bun:test';
import { patternsFor, type Pattern } from './correlation.ts';
import type { Checkin, HabitCheck } from '../types.ts';

function check(habitId: string, day: string, status: HabitCheck['status'] = 'done'): HabitCheck {
  return {
    id: `${habitId}_${day}`,
    habitId,
    checkedAt: `${day}T09:00:00Z`,
    status,
    source: 'manual',
  };
}

function checkin(day: string, over: Partial<Checkin> = {}): Checkin {
  return {
    id: `c_${day}`,
    date: day,
    createdAt: `${day}T07:30:00Z`,
    ...over,
  };
}

function dayAt(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

describe('patternsFor', () => {
  it('returns nothing with insufficient data', () => {
    const result = patternsFor([], [], []);
    expect(result).toEqual([]);
  });

  it('surfaces the sleep → energy pattern when the high group beats the low group', () => {
    // Seven nights with sleep + next-day energy. Sleep-heavy days
    // correspond with higher next-day energy.
    const checkins: Checkin[] = [
      checkin(dayAt(2026, 1, 1), { sleepHours: 8 }),
      checkin(dayAt(2026, 1, 2), { energy: 5, sleepHours: 8 }),
      checkin(dayAt(2026, 1, 3), { energy: 4, sleepHours: 7 }),
      checkin(dayAt(2026, 1, 4), { energy: 5, sleepHours: 9 }),
      checkin(dayAt(2026, 1, 5), { energy: 2, sleepHours: 5 }),
      checkin(dayAt(2026, 1, 6), { energy: 2, sleepHours: 5 }),
      checkin(dayAt(2026, 1, 7), { energy: 3, sleepHours: 5 }),
      checkin(dayAt(2026, 1, 8), { energy: 4 }),
    ];
    const patterns = patternsFor(checkins, [], []);
    const sleep = patterns.find((p: Pattern) => p.id === 'sleep-energy');
    expect(sleep).toBeDefined();
    expect(sleep!.delta).toBeGreaterThan(0);
  });

  it('does NOT surface a pattern when the delta is too small', () => {
    const checkins: Checkin[] = [];
    for (let i = 0; i < 10; i++) {
      const day = dayAt(2026, 2, i + 1);
      checkins.push(checkin(day, { sleepHours: 7 + (i % 2 ? 0.1 : -0.1) }));
      const next = dayAt(2026, 2, i + 2);
      checkins.push(checkin(next, { energy: 3 }));
    }
    const patterns = patternsFor(checkins, [], []);
    expect(patterns.find((p: Pattern) => p.id === 'sleep-energy')).toBeUndefined();
  });

  it('surfaces movement → mood when matched habits were done', () => {
    const movementHabitId = 'h_move';
    // Move on Jan 2 + Jan 4; rest other days.
    const checks: HabitCheck[] = [
      check(movementHabitId, dayAt(2026, 1, 2)),
      check(movementHabitId, dayAt(2026, 1, 4)),
      check(movementHabitId, dayAt(2026, 1, 6)),
      check(movementHabitId, dayAt(2026, 1, 8)),
    ];
    const checkins: Checkin[] = [
      checkin(dayAt(2026, 1, 3), { mood: 5 }), // after move
      checkin(dayAt(2026, 1, 5), { mood: 4 }), // after move
      checkin(dayAt(2026, 1, 7), { mood: 4 }), // after move
      checkin(dayAt(2026, 1, 9), { mood: 4 }), // after move
      checkin(dayAt(2026, 1, 10), { mood: 2 }), // rest day prev
      checkin(dayAt(2026, 1, 11), { mood: 3 }), // rest day prev
      checkin(dayAt(2026, 1, 12), { mood: 2 }), // rest day prev
      checkin(dayAt(2026, 1, 13), { mood: 3 }), // rest day prev
    ];
    const patterns = patternsFor(checkins, checks, [movementHabitId]);
    const movement = patterns.find((p: Pattern) => p.id === 'movement-mood');
    expect(movement).toBeDefined();
    expect(movement!.delta).toBeGreaterThan(0);
  });

  it('sorts patterns by sample size descending', () => {
    const movementHabitId = 'h_move';
    const checks: HabitCheck[] = Array.from({ length: 10 }, (_, i) =>
      check(movementHabitId, dayAt(2026, 3, i + 1)),
    );
    const checkins: Checkin[] = [];
    for (let i = 0; i < 30; i++) {
      const day = dayAt(2026, 3, i + 1);
      checkins.push(checkin(day, { mood: 3 + (i % 2 ? 1 : -1), sleepHours: 7 + (i % 3 ? 0 : 1), energy: 3 }));
    }
    const patterns = patternsFor(checkins, checks, [movementHabitId]);
    if (patterns.length > 1) {
      const first = patterns[0]!;
      const second = patterns[1]!;
      expect(first.sample).toBeGreaterThanOrEqual(second.sample);
    }
  });
});
