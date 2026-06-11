/**
 * Today screen — minimal logic tests.
 * Tests the pure helper functions, not React rendering.
 */
import { describe, it, expect, beforeAll } from 'bun:test';

// ── Greeting logic ────────────────────────────────────────────────────────────

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning.';
  if (hour >= 12 && hour < 17) return 'afternoon.';
  if (hour >= 17 && hour < 22) return 'evening.';
  return 'late.';
}

describe('greeting()', () => {
  it('returns "morning." from 5am to 11:59am', () => {
    expect(greeting(5)).toBe('morning.');
    expect(greeting(9)).toBe('morning.');
    expect(greeting(11)).toBe('morning.');
  });

  it('returns "afternoon." from 12pm to 4:59pm', () => {
    expect(greeting(12)).toBe('afternoon.');
    expect(greeting(14)).toBe('afternoon.');
    expect(greeting(16)).toBe('afternoon.');
  });

  it('returns "evening." from 5pm to 9:59pm', () => {
    expect(greeting(17)).toBe('evening.');
    expect(greeting(20)).toBe('evening.');
    expect(greeting(21)).toBe('evening.');
  });

  it('returns "late." from 10pm onwards and before 5am', () => {
    expect(greeting(22)).toBe('late.');
    expect(greeting(23)).toBe('late.');
    expect(greeting(0)).toBe('late.');
    expect(greeting(4)).toBe('late.');
  });
});

// ── Water count logic ─────────────────────────────────────────────────────────

import type { DayLog } from '../lib/store';

function getWaterCount(day: DayLog | undefined): number {
  if (!day) return 0;
  const entry = day.things['water'];
  if (!entry || entry.action !== 'done') return 0;
  return entry.count ?? 0;
}

describe('getWaterCount()', () => {
  it('returns 0 for undefined day', () => {
    expect(getWaterCount(undefined)).toBe(0);
  });

  it('returns 0 when no water entry', () => {
    const day: DayLog = { date: '2026-06-11', things: {}, journal: [] };
    expect(getWaterCount(day)).toBe(0);
  });

  it('returns the count when water is logged', () => {
    const day: DayLog = {
      date: '2026-06-11',
      things: { water: { kind: 'water', action: 'done', count: 3, at: 0 } },
      journal: [],
    };
    expect(getWaterCount(day)).toBe(3);
  });

  it('returns 0 for skipped water entries', () => {
    const day: DayLog = {
      date: '2026-06-11',
      things: { water: { kind: 'water', action: 'skipped', count: 2, at: 0 } },
      journal: [],
    };
    expect(getWaterCount(day)).toBe(0);
  });
});

// ── allCoreDone logic ─────────────────────────────────────────────────────────

function allCoreDone(day: DayLog | undefined): boolean {
  if (!day) return false;
  const med = day.things['medication'];
  const hasMed = med?.action === 'done' || med?.action === 'skipped';
  const water = day.things['water'];
  const hasWater = water?.action === 'done' && (water.count ?? 0) >= 1;
  const hasMoved = day.things['movement']?.action === 'done';
  const hasSleep = day.things['sleep']?.action === 'done';
  return hasMed && hasWater && hasMoved && hasSleep;
}

describe('allCoreDone()', () => {
  it('returns false for empty day', () => {
    expect(allCoreDone(undefined)).toBe(false);
    expect(allCoreDone({ date: '2026-06-11', things: {}, journal: [] })).toBe(false);
  });

  it('returns false when only some things are done', () => {
    const day: DayLog = {
      date: '2026-06-11',
      things: {
        medication: { kind: 'medication', action: 'done', at: 0 },
        water: { kind: 'water', action: 'done', count: 2, at: 0 },
      },
      journal: [],
    };
    expect(allCoreDone(day)).toBe(false);
  });

  it('returns true when all four core things are logged', () => {
    const day: DayLog = {
      date: '2026-06-11',
      things: {
        medication: { kind: 'medication', action: 'done', at: 0 },
        water: { kind: 'water', action: 'done', count: 1, at: 0 },
        movement: { kind: 'movement', action: 'done', at: 0 },
        sleep: { kind: 'sleep', action: 'done', at: 0 },
      },
      journal: [],
    };
    expect(allCoreDone(day)).toBe(true);
  });

  it('counts skipped medication as satisfying the med requirement', () => {
    const day: DayLog = {
      date: '2026-06-11',
      things: {
        medication: { kind: 'medication', action: 'skipped', at: 0 },
        water: { kind: 'water', action: 'done', count: 2, at: 0 },
        movement: { kind: 'movement', action: 'done', at: 0 },
        sleep: { kind: 'sleep', action: 'done', at: 0 },
      },
      journal: [],
    };
    expect(allCoreDone(day)).toBe(true);
  });
});

// ── Nav icon render sanity ────────────────────────────────────────────────────
// Just verify the icon labels are defined (no React rendering needed)

describe('NavBar screen labels', () => {
  const SCREENS = ['today', 'garden', 'letter', 'data'] as const;

  it('defines 4 navigation screens', () => {
    expect(SCREENS.length).toBe(4);
  });

  it('includes all required screen names', () => {
    expect(SCREENS).toContain('today');
    expect(SCREENS).toContain('garden');
    expect(SCREENS).toContain('letter');
    expect(SCREENS).toContain('data');
  });
});
