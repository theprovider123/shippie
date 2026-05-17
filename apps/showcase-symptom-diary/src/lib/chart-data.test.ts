import { describe, expect, it } from 'bun:test';
import {
  binDosesByDay,
  binEntriesByDay,
  buildCharts,
  dayRange,
  lastNDays,
  shortDayLabel,
  toLocalDay,
} from './chart-data.ts';
import type { Entry, Symptom } from '../db/schema.ts';

const sym = (over: Partial<Symptom> = {}): Symptom => ({
  id: 's1',
  name: 'Pain',
  default_scale: '1-5',
  sort_order: 0,
  ...over,
});

const ent = (occurred_at: string, intensity: number, symptom_id = 's1'): Entry => ({
  id: `e_${occurred_at}_${intensity}`,
  occurred_at,
  symptom_id,
  intensity,
  note: null,
  trigger_text: null,
});

describe('toLocalDay', () => {
  it('returns YYYY-MM-DD in local time', () => {
    // Construct from local-time so the assertion is timezone-stable.
    const local = new Date(2026, 3, 15, 9, 30, 0); // 2026-04-15 local
    expect(toLocalDay(local.toISOString())).toBe('2026-04-15');
  });
});

describe('dayRange', () => {
  it('returns inclusive day list', () => {
    const days = dayRange('2026-04-10', '2026-04-13');
    expect(days).toEqual(['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13']);
  });

  it('returns single day when from === to', () => {
    expect(dayRange('2026-04-10', '2026-04-10')).toEqual(['2026-04-10']);
  });

  it('returns empty when from > to', () => {
    expect(dayRange('2026-04-13', '2026-04-10')).toEqual([]);
  });
});

describe('binEntriesByDay', () => {
  it('takes peak intensity per day for 1-5 symptoms', () => {
    const symptom = sym();
    // Two entries on the same local day; peak is 4.
    const e1 = ent(new Date(2026, 3, 12, 9, 0).toISOString(), 2);
    const e2 = ent(new Date(2026, 3, 12, 18, 0).toISOString(), 4);
    const e3 = ent(new Date(2026, 3, 13, 10, 0).toISOString(), 1);

    const chart = binEntriesByDay([e1, e2, e3], symptom, '2026-04-12', '2026-04-14');
    expect(chart.bins).toHaveLength(3);
    expect(chart.bins[0]).toMatchObject({ day: '2026-04-12', peak: 4, count: 2 });
    expect(chart.bins[1]).toMatchObject({ day: '2026-04-13', peak: 1, count: 1 });
    expect(chart.bins[2]).toMatchObject({ day: '2026-04-14', peak: 0, count: 0 });
    expect(chart.totalEntries).toBe(3);
  });

  it('clamps 1-5 intensity to the 1..5 range', () => {
    const symptom = sym();
    const high = ent(new Date(2026, 3, 12, 9, 0).toISOString(), 9);
    const low = ent(new Date(2026, 3, 12, 10, 0).toISOString(), -2);
    const chart = binEntriesByDay([high, low], symptom, '2026-04-12', '2026-04-12');
    expect(chart.bins[0]!.peak).toBe(5);
  });

  it('treats present-absent symptoms as 5 when present, 0 when absent', () => {
    const symptom = sym({ default_scale: 'present-absent' });
    const present = ent(new Date(2026, 3, 12, 9, 0).toISOString(), 1);
    const absent = ent(new Date(2026, 3, 13, 9, 0).toISOString(), 0);
    const chart = binEntriesByDay([present, absent], symptom, '2026-04-12', '2026-04-13');
    expect(chart.bins[0]!.peak).toBe(5);
    expect(chart.bins[1]!.peak).toBe(0);
  });

  it('ignores entries from other symptoms', () => {
    const symptom = sym({ id: 's1' });
    const other = ent(new Date(2026, 3, 12, 9, 0).toISOString(), 5, 's2');
    const own = ent(new Date(2026, 3, 12, 10, 0).toISOString(), 2);
    const chart = binEntriesByDay([other, own], symptom, '2026-04-12', '2026-04-12');
    expect(chart.bins[0]!.peak).toBe(2);
    expect(chart.totalEntries).toBe(1);
  });

  it('drops entries outside the range', () => {
    const symptom = sym();
    const inside = ent(new Date(2026, 3, 12, 9, 0).toISOString(), 3);
    const outside = ent(new Date(2026, 4, 1, 9, 0).toISOString(), 5);
    const chart = binEntriesByDay([inside, outside], symptom, '2026-04-10', '2026-04-15');
    expect(chart.totalEntries).toBe(1);
  });
});

describe('buildCharts', () => {
  it('builds a chart per symptom', () => {
    const a = sym({ id: 'a', name: 'Pain' });
    const b = sym({ id: 'b', name: 'Fatigue' });
    const entries = [
      ent(new Date(2026, 3, 12, 9, 0).toISOString(), 3, 'a'),
      ent(new Date(2026, 3, 12, 9, 0).toISOString(), 4, 'b'),
    ];
    const charts = buildCharts(entries, [a, b], '2026-04-12', '2026-04-12');
    expect(charts).toHaveLength(2);
    expect(charts.map((c) => c.symptomName)).toEqual(['Pain', 'Fatigue']);
  });
});

describe('lastNDays', () => {
  it('returns inclusive 7-day window ending today', () => {
    const ref = new Date(2026, 3, 15, 12, 0).toISOString();
    const { from, to } = lastNDays(7, ref);
    expect(to).toBe('2026-04-15');
    expect(from).toBe('2026-04-09');
  });
});

describe('binDosesByDay', () => {
  it('counts doses per day', () => {
    const doses = [
      { taken_at: new Date(2026, 3, 12, 8, 0).toISOString() },
      { taken_at: new Date(2026, 3, 12, 20, 0).toISOString() },
      { taken_at: new Date(2026, 3, 13, 9, 0).toISOString() },
    ];
    const bins = binDosesByDay(doses, '2026-04-12', '2026-04-14');
    expect(bins[0]).toEqual({ day: '2026-04-12', count: 2 });
    expect(bins[1]).toEqual({ day: '2026-04-13', count: 1 });
    expect(bins[2]).toEqual({ day: '2026-04-14', count: 0 });
  });
});

describe('shortDayLabel', () => {
  it('returns weekday + day-of-month', () => {
    const label = shortDayLabel('2026-04-15');
    // Don't assert the locale-specific weekday string itself; assert
    // that day-of-month appears at the end.
    expect(label).toMatch(/15$/);
  });
});
