import { describe, expect, test } from 'bun:test';
import type { SymptomEntry } from '../sync/care-doc.ts';
import { distinctLabels, groupByDay, intensityAverage } from './symptom-aggregate.ts';

function makeEntry(partial: Partial<SymptomEntry> & { occurred_at: number; label: string }): SymptomEntry {
  return {
    id: partial.id ?? Math.random().toString(36),
    label: partial.label,
    intensity: partial.intensity ?? 0,
    occurred_at: partial.occurred_at,
    note: partial.note ?? '',
    logged_by: partial.logged_by ?? 'a',
  };
}

describe('groupByDay', () => {
  test('buckets by ISO date', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'headache', occurred_at: new Date('2026-05-01T10:00:00').getTime() }),
      makeEntry({ label: 'nausea', occurred_at: new Date('2026-05-01T15:00:00').getTime() }),
      makeEntry({ label: 'headache', occurred_at: new Date('2026-05-02T10:00:00').getTime() }),
    ];
    const days = groupByDay(entries);
    expect(days.length).toBe(2);
    expect(days[0]?.iso).toBe('2026-05-01');
    expect(days[0]?.count).toBe(2);
    expect(days[1]?.iso).toBe('2026-05-02');
    expect(days[1]?.count).toBe(1);
  });

  test('per-label list is preserved', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'headache', intensity: 3, occurred_at: new Date('2026-05-01T10:00:00').getTime() }),
      makeEntry({ label: 'headache', intensity: 4, occurred_at: new Date('2026-05-01T15:00:00').getTime() }),
    ];
    const days = groupByDay(entries);
    expect(days[0]?.byLabel.get('headache')?.length).toBe(2);
  });

  test('returns sorted oldest-first', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'a', occurred_at: new Date('2026-05-03T10:00:00').getTime() }),
      makeEntry({ label: 'b', occurred_at: new Date('2026-05-01T10:00:00').getTime() }),
      makeEntry({ label: 'c', occurred_at: new Date('2026-05-02T10:00:00').getTime() }),
    ];
    const days = groupByDay(entries);
    expect(days.map((d) => d.iso)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });

  test('empty input → empty output', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('intensityAverage', () => {
  test('averages scored entries for a label', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'headache', intensity: 3, occurred_at: 1 }),
      makeEntry({ label: 'headache', intensity: 5, occurred_at: 2 }),
    ];
    expect(intensityAverage(entries, 'headache')).toBe(4);
  });

  test('skips intensity-0 (yes/observed sentinel)', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'mood', intensity: 0, occurred_at: 1 }),
      makeEntry({ label: 'mood', intensity: 4, occurred_at: 2 }),
    ];
    expect(intensityAverage(entries, 'mood')).toBe(4);
  });

  test('returns null when no scored entries match', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'mood', intensity: 0, occurred_at: 1 }),
    ];
    expect(intensityAverage(entries, 'mood')).toBeNull();
    expect(intensityAverage(entries, 'unknown')).toBeNull();
  });
});

describe('distinctLabels', () => {
  test('orders by frequency desc, alphabetical tiebreak', () => {
    const entries: SymptomEntry[] = [
      makeEntry({ label: 'headache', occurred_at: 1 }),
      makeEntry({ label: 'headache', occurred_at: 2 }),
      makeEntry({ label: 'nausea', occurred_at: 3 }),
      makeEntry({ label: 'a-label', occurred_at: 4 }),
      makeEntry({ label: 'z-label', occurred_at: 5 }),
    ];
    expect(distinctLabels(entries)).toEqual(['headache', 'a-label', 'nausea', 'z-label']);
  });
});
