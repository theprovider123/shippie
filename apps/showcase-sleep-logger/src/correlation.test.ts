import { describe, expect, test } from 'bun:test';
import { correlateSleepWithEvents, describeCorrelation, dayKey } from './correlation.ts';

function nights(days: number, start = new Date('2026-04-01').getTime()) {
  return Array.from({ length: days }, (_, i) => ({
    date: dayKey(start + i * 24 * 60 * 60 * 1000),
    quality: 5,
  }));
}

describe('correlateSleepWithEvents', () => {
  test('returns null below the 14-day overlap threshold', () => {
    const result = correlateSleepWithEvents(nights(10), [
      { at: new Date('2026-04-01').getTime() },
      { at: new Date('2026-04-02').getTime() },
    ]);
    expect(result).toBeNull();
  });

  test('returns a correlation when 14+ overlapping days exist', () => {
    const start = new Date('2026-04-01').getTime();
    const ns = Array.from({ length: 20 }, (_, i) => ({
      date: dayKey(start + i * 24 * 60 * 60 * 1000),
      quality: 4 + (i % 3),
    }));
    const events = ns.map((n) => ({
      at: new Date(n.date).getTime() + 12 * 60 * 60 * 1000,
    }));
    const result = correlateSleepWithEvents(ns, events);
    expect(result).not.toBeNull();
    expect(result!.daysAnalysed).toBe(20);
  });

  test('returns 0 when y has no variance', () => {
    const start = new Date('2026-04-01').getTime();
    const ns = Array.from({ length: 14 }, (_, i) => ({
      date: dayKey(start + i * 24 * 60 * 60 * 1000),
      quality: 7,
    }));
    const events = ns.map((n) => ({ at: new Date(n.date).getTime() + 12 * 60 * 60 * 1000 }));
    const result = correlateSleepWithEvents(ns, events);
    expect(result?.pearson).toBe(0);
  });
});

describe('describeCorrelation', () => {
  test('labels strong positive correlation', () => {
    const text = describeCorrelation({ pearson: 0.7, daysAnalysed: 30 });
    expect(text).toContain('strong');
    expect(text).toContain('better');
  });

  test('labels mild negative correlation', () => {
    const text = describeCorrelation({ pearson: -0.2, daysAnalysed: 30 });
    expect(text).toContain('mild');
    expect(text).toContain('worse');
  });
});
