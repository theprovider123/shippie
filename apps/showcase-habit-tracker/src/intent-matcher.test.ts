import { describe, expect, test } from 'bun:test';
import { habitsToAutoCheck } from './intent-matcher.ts';

const habits = [
  { id: 'h_cooked', intent: 'cooked-meal' as const },
  { id: 'h_exercise', intent: 'workout-completed' as const },
  { id: 'h_journal' },
];

describe('habitsToAutoCheck — habit-tracker auto-check logic', () => {
  test('matches habit by intent name', () => {
    expect(habitsToAutoCheck('cooked-meal', habits, [], '2026-04-28')).toEqual(['h_cooked']);
  });

  test('matches multiple habits with the same intent', () => {
    const dupe = [
      { id: 'a', intent: 'cooked-meal' as const },
      { id: 'b', intent: 'cooked-meal' as const },
    ];
    expect(habitsToAutoCheck('cooked-meal', dupe, [], '2026-04-28')).toEqual(['a', 'b']);
  });

  test('skips habits already checked today', () => {
    const checks = [{ habitId: 'h_cooked', checkedAt: '2026-04-28T10:00:00Z' }];
    expect(habitsToAutoCheck('cooked-meal', habits, checks, '2026-04-28')).toEqual([]);
  });

  test('does not skip habits checked on other days', () => {
    const checks = [{ habitId: 'h_cooked', checkedAt: '2026-04-27T10:00:00Z' }];
    expect(habitsToAutoCheck('cooked-meal', habits, checks, '2026-04-28')).toEqual(['h_cooked']);
  });

  test('returns empty when no habit matches the intent', () => {
    expect(habitsToAutoCheck('budget-limit', habits, [], '2026-04-28')).toEqual([]);
  });

  test('habits without a declared intent never match', () => {
    expect(habitsToAutoCheck('cooked-meal', [{ id: 'x' }], [], '2026-04-28')).toEqual([]);
  });
});
