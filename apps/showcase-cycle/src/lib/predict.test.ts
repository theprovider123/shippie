import { describe, expect, it } from 'bun:test';
import {
  classifyConfidence,
  fertileWindowFor,
  formatRange,
  predictNextCycle,
  recentCycleLengths,
} from './predict.ts';
import type { Cycle } from '../db/schema.ts';

function cycle(id: string, started_on: string, length_days?: number | null): Cycle {
  return {
    id,
    started_on,
    ended_on: null,
    length_days: length_days ?? null,
    notes: null,
    created_at: started_on,
  };
}

describe('classifyConfidence', () => {
  it('returns high when stddev is small', () => {
    expect(classifyConfidence(0.5)).toBe('high');
    expect(classifyConfidence(1.9)).toBe('high');
  });

  it('returns medium between 2 and 4', () => {
    expect(classifyConfidence(2)).toBe('medium');
    expect(classifyConfidence(3.5)).toBe('medium');
  });

  it('returns low at 4+', () => {
    expect(classifyConfidence(4)).toBe('low');
    expect(classifyConfidence(8)).toBe('low');
  });
});

describe('recentCycleLengths', () => {
  it('skips cycles without length_days', () => {
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null), // most recent, still open
      cycle('b', '2025-03-12', 29),
      cycle('c', '2025-02-12', 28),
      cycle('d', '2025-01-15', 28),
    ];
    expect(recentCycleLengths(cycles)).toEqual([29, 28, 28]);
  });

  it('caps at maxCycles', () => {
    const cycles: Cycle[] = [
      cycle('z', '2025-05-01', null),
      cycle('a', '2025-04-01', 28),
      cycle('b', '2025-03-04', 28),
      cycle('c', '2025-02-04', 28),
      cycle('d', '2025-01-07', 28),
      cycle('e', '2024-12-10', 28),
      cycle('f', '2024-11-12', 28),
      cycle('g', '2024-10-15', 28),
    ];
    expect(recentCycleLengths(cycles, 6)).toHaveLength(6);
  });
});

describe('predictNextCycle', () => {
  it('returns null when fewer than 3 closed cycles', () => {
    const cycles: Cycle[] = [
      cycle('a', '2025-03-01', null),
      cycle('b', '2025-02-01', 28),
    ];
    expect(predictNextCycle(cycles)).toBeNull();
  });

  it('returns null when no cycles at all', () => {
    expect(predictNextCycle([])).toBeNull();
  });

  it('predicts a tight range with high confidence for regular cycles', () => {
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null),
      cycle('b', '2025-03-13', 28),
      cycle('c', '2025-02-13', 28),
      cycle('d', '2025-01-16', 28),
      cycle('e', '2024-12-19', 28),
    ];
    const p = predictNextCycle(cycles);
    expect(p).not.toBeNull();
    expect(p!.confidence).toBe('high');
    expect(p!.predictedStart).toBe('2025-05-08'); // 2025-04-10 + 28
    // Range floor = 2 days wide.
    expect(new Date(p!.range[0]).getTime()).toBeLessThan(new Date(p!.range[1]).getTime());
    expect(p!.sampleSize).toBe(4);
  });

  it('returns medium confidence with a wider range for moderate variability', () => {
    // Lengths 26 / 32 / 26 / 32 give stddev = 3 → medium-band per
    // classifyConfidence (2 ≤ stddev < 4).
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null),
      cycle('b', '2025-03-13', 26),
      cycle('c', '2025-02-10', 32),
      cycle('d', '2025-01-13', 26),
      cycle('e', '2024-12-12', 32),
    ];
    const p = predictNextCycle(cycles);
    expect(p).not.toBeNull();
    expect(p!.confidence).toBe('medium');
    // Range must be at least 4 days wide (medium-band stddev > 1).
    const earliest = new Date(p!.range[0]).getTime();
    const latest = new Date(p!.range[1]).getTime();
    expect((latest - earliest) / (1000 * 60 * 60 * 24)).toBeGreaterThanOrEqual(2);
  });

  it('returns low confidence with a wide range for irregular cycles', () => {
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null),
      cycle('b', '2025-03-15', 26),
      cycle('c', '2025-02-10', 33),
      cycle('d', '2025-01-08', 35),
      cycle('e', '2024-12-04', 25),
    ];
    const p = predictNextCycle(cycles);
    expect(p).not.toBeNull();
    expect(p!.confidence).toBe('low');
    // Range capped so the UI stays readable, but always wider than 2.
    const earliest = new Date(p!.range[0]).getTime();
    const latest = new Date(p!.range[1]).getTime();
    const widthDays = (latest - earliest) / (1000 * 60 * 60 * 24);
    expect(widthDays).toBeGreaterThan(2);
    expect(widthDays).toBeLessThanOrEqual(10);
  });

  it('always returns a range, never a single point', () => {
    // Even with zero variance, the floor is 2 days.
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null),
      cycle('b', '2025-03-13', 28),
      cycle('c', '2025-02-13', 28),
      cycle('d', '2025-01-16', 28),
    ];
    const p = predictNextCycle(cycles);
    expect(p).not.toBeNull();
    expect(p!.range[0]).not.toBe(p!.range[1]);
  });
});

describe('fertileWindowFor', () => {
  it('returns null when prediction is null', () => {
    expect(fertileWindowFor(null)).toBeNull();
  });

  it('places ovulation 14 days before predicted start', () => {
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null),
      cycle('b', '2025-03-13', 28),
      cycle('c', '2025-02-13', 28),
      cycle('d', '2025-01-16', 28),
    ];
    const p = predictNextCycle(cycles)!;
    const w = fertileWindowFor(p)!;
    // 2025-05-08 - 14 = 2025-04-24
    expect(w.ovulation).toBe('2025-04-24');
    // 5 days before through 1 day after — 6-day inner window.
    expect(w.range[0]).toBe('2025-04-19');
    expect(w.range[1]).toBe('2025-04-25');
  });

  it('widens the outer envelope for low-confidence predictions', () => {
    const cycles: Cycle[] = [
      cycle('a', '2025-04-10', null),
      cycle('b', '2025-03-15', 26),
      cycle('c', '2025-02-10', 33),
      cycle('d', '2025-01-08', 35),
      cycle('e', '2024-12-04', 25),
    ];
    const p = predictNextCycle(cycles)!;
    const w = fertileWindowFor(p)!;
    // outer must contain inner.
    expect(w.outerRange[0] <= w.range[0]).toBe(true);
    expect(w.outerRange[1] >= w.range[1]).toBe(true);
  });
});

describe('formatRange', () => {
  it('compresses when both ends are in the same month', () => {
    expect(formatRange(['2025-05-12', '2025-05-16'])).toBe('12 - 16 May');
  });

  it('spells both ends across months', () => {
    expect(formatRange(['2025-05-30', '2025-06-03'])).toMatch(/30 May - 3 Jun/);
  });
});
