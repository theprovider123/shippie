import { describe, test, expect, beforeEach } from 'bun:test';

// In-memory localStorage mock
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
}

(globalThis as unknown as Record<string, unknown>).localStorage = new MemoryStorage();

import { computeObservations, MIN_EVIDENCE, type Observation } from './observations';
import type { DayLog, AmbientEvent } from './store';

// Build a day with movement + mood
function makeMovementDay(date: string, mood: DayLog['mood']): DayLog {
  return {
    date,
    mood,
    things: {
      movement: { kind: 'movement', action: 'done', at: 1 },
    },
    journal: [],
  };
}

function makeStationaryDay(date: string, mood: DayLog['mood']): DayLog {
  return { date, mood, things: {}, journal: [] };
}

function makeHeavyJournaledDay(date: string): DayLog {
  return {
    date,
    mood: 'heavy',
    things: {},
    journal: [{ id: 'j1', text: 'wrote something', at: 1 }],
  };
}

describe('observations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns empty when below MIN_EVIDENCE threshold', () => {
    // Only 3 days — below 7
    const days: Record<string, DayLog> = {
      '2026-06-01': makeMovementDay('2026-06-01', 'light'),
      '2026-06-02': makeStationaryDay('2026-06-02', 'low'),
      '2026-06-03': makeMovementDay('2026-06-03', 'okay'),
    };
    const result = computeObservations(days, [], []);
    expect(result).toHaveLength(0);
  });

  test('dismissed observations are excluded', () => {
    // Build enough data to trigger movement-mood observation
    const days: Record<string, DayLog> = {};
    for (let i = 1; i <= 8; i++) {
      const date = `2026-06-${String(i).padStart(2, '0')}`;
      days[date] = i % 2 === 0
        ? makeMovementDay(date, 'light')
        : makeStationaryDay(date, 'low');
    }
    // Add 3 more so we have enough moved+mood AND stationary+mood
    days['2026-06-09'] = makeMovementDay('2026-06-09', 'bright');
    days['2026-06-10'] = makeMovementDay('2026-06-10', 'light');

    const dismissed = ['obs:movement-mood', 'obs:journal-heavy', 'obs:coffee-sleep'];
    const result = computeObservations(days, [], dismissed);
    expect(result.every((o) => !dismissed.includes(o.id))).toBe(true);
  });

  test('microcopy suffix invariant — each observation ends with approved phrase', () => {
    const VALID_SUFFIXES = ['just something noticed', 'worth knowing, nothing more'];

    // Build enough heavy+journaled days to trigger journal-heavy
    const days: Record<string, DayLog> = {};
    for (let i = 1; i <= 8; i++) {
      const date = `2026-06-${String(i).padStart(2, '0')}`;
      days[date] = makeHeavyJournaledDay(date);
    }
    // Also add enough movement days to potentially trigger movement-mood
    for (let i = 9; i <= 14; i++) {
      const date = `2026-06-${String(i).padStart(2, '0')}`;
      days[date] = i % 2 === 0
        ? makeMovementDay(date, 'light')
        : makeStationaryDay(date, 'low');
    }
    days['2026-06-15'] = makeMovementDay('2026-06-15', 'bright');
    days['2026-06-16'] = makeMovementDay('2026-06-16', 'light');
    days['2026-06-17'] = makeMovementDay('2026-06-17', 'bright');

    const results = computeObservations(days, [], []);
    for (const obs of results) {
      const endsCorrectly = VALID_SUFFIXES.some((suffix) =>
        obs.microcopy.endsWith(suffix),
      );
      expect(endsCorrectly).toBe(true);
    }
  });

  test('MIN_EVIDENCE is 7', () => {
    expect(MIN_EVIDENCE).toBe(7);
  });

  test('no observations for empty days', () => {
    expect(computeObservations({}, [], [])).toHaveLength(0);
  });
});
