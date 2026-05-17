import { describe, expect, test } from 'bun:test';
import { habitsToAutoCheck, cuesToFire } from './intent-matcher.ts';

const habits = [
  { id: 'h_cooked', cue: { intent: 'cooked-meal', autoCheck: true } },
  { id: 'h_exercise', cue: { intent: 'workout-completed', autoCheck: true } },
  { id: 'h_journal' },
];

describe('habitsToAutoCheck — habit-tracker auto-check logic', () => {
  test('matches habit by cue intent', () => {
    expect(habitsToAutoCheck('cooked-meal', habits, [], '2026-04-28')).toEqual(['h_cooked']);
  });

  test('matches multiple habits with the same intent', () => {
    const dupe = [
      { id: 'a', cue: { intent: 'cooked-meal', autoCheck: true } },
      { id: 'b', cue: { intent: 'cooked-meal', autoCheck: true } },
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

  test('habits without a declared cue intent never match', () => {
    expect(habitsToAutoCheck('cooked-meal', [{ id: 'x' }], [], '2026-04-28')).toEqual([]);
  });

  test('legacy `intent` field still matches (backwards compat)', () => {
    const legacy = [{ id: 'old', intent: 'cooked-meal' }];
    expect(habitsToAutoCheck('cooked-meal', legacy, [], '2026-04-28')).toEqual(['old']);
  });

  test('archived habits never auto-check', () => {
    const archived = [
      {
        id: 'h_done',
        cue: { intent: 'cooked-meal', autoCheck: true },
        archivedAt: '2026-04-20T00:00:00Z',
      },
    ];
    expect(habitsToAutoCheck('cooked-meal', archived, [], '2026-04-28')).toEqual([]);
  });

  test('cue with autoCheck=false is excluded from auto-check', () => {
    const reminderOnly = [{ id: 'h_med', cue: { intent: 'coffee-brewed', autoCheck: false } }];
    expect(habitsToAutoCheck('coffee-brewed', reminderOnly, [], '2026-04-28')).toEqual([]);
  });
});

describe('cuesToFire — reminder-only cue prompts', () => {
  test('fires for habits with autoCheck=false', () => {
    const reminderOnly = [{ id: 'h_med', cue: { intent: 'coffee-brewed', autoCheck: false } }];
    expect(cuesToFire('coffee-brewed', reminderOnly, [], '2026-04-28')).toEqual(['h_med']);
  });

  test('does not fire for autoCheck=true habits (they auto-check instead)', () => {
    expect(cuesToFire('cooked-meal', habits, [], '2026-04-28')).toEqual([]);
  });

  test('does not fire when habit was already checked today', () => {
    const reminderOnly = [{ id: 'h_med', cue: { intent: 'coffee-brewed', autoCheck: false } }];
    const checks = [{ habitId: 'h_med', checkedAt: '2026-04-28T08:00:00Z' }];
    expect(cuesToFire('coffee-brewed', reminderOnly, checks, '2026-04-28')).toEqual([]);
  });

  test('does not fire for archived habits', () => {
    const archived = [
      {
        id: 'h_med',
        cue: { intent: 'coffee-brewed', autoCheck: false },
        archivedAt: '2026-04-20T00:00:00Z',
      },
    ];
    expect(cuesToFire('coffee-brewed', archived, [], '2026-04-28')).toEqual([]);
  });
});
