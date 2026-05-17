import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';
import { summarizeMove } from './move.ts';

describe('Move', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });

  test('summarizes movement entries', () => {
    expect(
      summarizeMove([
        { id: '1', kind: 'plan', createdAt: 1, distanceKm: 5 },
        { id: '2', kind: 'workout', createdAt: 2, minutes: 40 },
        { id: '3', kind: 'sleep', createdAt: 3, sleepHours: 7.5 },
        { id: '4', kind: 'sleep', createdAt: 4, sleepHours: 6.5 },
      ]),
    ).toEqual({ plans: 1, workouts: 1, nights: 2, totalMinutes: 40, avgSleep: 7 });
  });
});
