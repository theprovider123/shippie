import { describe, expect, it } from 'bun:test';
import {
  detectPatterns,
  premenstrualInsight,
  symptomClusterInsights,
  variabilityInsight,
} from './insights.ts';
import type { Cycle, Day } from '../db/schema.ts';

// length_days mirrors what recomputeLengths() fills in-app (completed cycles
// carry a length; the newest open cycle does not).
function cycle(id: string, started_on: string, length_days?: number): Cycle {
  return { id, started_on, length_days: length_days ?? null };
}
let n = 0;
function day(cycle_id: string, date: string, over: Partial<Day> = {}): Day {
  return { id: `d${n++}`, cycle_id, date, ...over };
}

// Three regular ~28-day cycles (newest first; c1/c2 completed at 28d).
const REGULAR: Cycle[] = [
  cycle('c3', '2025-03-01'),
  cycle('c2', '2025-02-01', 28),
  cycle('c1', '2025-01-04', 28),
];

describe('variabilityInsight', () => {
  it('returns null with fewer than two cycle lengths', () => {
    expect(variabilityInsight([cycle('c1', '2025-01-01')])).toBeNull();
  });

  it('reads regular cycles as fairly regular (high confidence)', () => {
    const ins = variabilityInsight(REGULAR);
    expect(ins).not.toBeNull();
    expect(ins!.kind).toBe('variability');
    expect(ins!.confidence).toBe('high');
    expect(ins!.text.toLowerCase()).toContain('regular');
  });

  it('flags irregular cycles with a wider range + lower confidence', () => {
    const irregular: Cycle[] = [
      cycle('c4', '2025-04-20'),
      cycle('c3', '2025-03-01', 50),
      cycle('c2', '2025-02-10', 19),
      cycle('c1', '2025-01-01', 40),
    ];
    const ins = variabilityInsight(irregular);
    expect(ins).not.toBeNull();
    expect(ins!.confidence).toBe('low');
    expect(ins!.text).toContain('±');
  });
});

describe('symptomClusterInsights', () => {
  it('surfaces a symptom that clusters on early cycle days (>=3 logs)', () => {
    const days = [
      day('c1', '2025-01-04', { symptoms_json: JSON.stringify(['cramps']) }), // day 1
      day('c1', '2025-01-05', { symptoms_json: JSON.stringify(['cramps']) }), // day 2
      day('c2', '2025-02-01', { symptoms_json: JSON.stringify(['cramps']) }), // day 1
    ];
    const out = symptomClusterInsights(REGULAR, days);
    const cramps = out.find((i) => i.id === 'cluster-cramps');
    expect(cramps).toBeDefined();
    expect(cramps!.text.toLowerCase()).toContain('cramps');
    expect(cramps!.text).toMatch(/day/);
  });

  it('ignores symptoms logged fewer than 3 times', () => {
    const days = [day('c1', '2025-01-04', { symptoms_json: JSON.stringify(['acne']) })];
    expect(symptomClusterInsights(REGULAR, days)).toHaveLength(0);
  });
});

describe('premenstrualInsight', () => {
  it('detects a mood dip in the days before the period', () => {
    // mood high early in each cycle, low late (near ~28d boundary)
    const days: Day[] = [];
    for (const [cid, start] of [['c1', '2025-01-04'], ['c2', '2025-02-01']] as const) {
      days.push(day(cid, addDay(start, 3), { mood: 5 }));
      days.push(day(cid, addDay(start, 5), { mood: 5 }));
      days.push(day(cid, addDay(start, 24), { mood: 2 }));
      days.push(day(cid, addDay(start, 26), { mood: 2 }));
    }
    const ins = premenstrualInsight(REGULAR, days);
    expect(ins).not.toBeNull();
    expect(ins!.kind).toBe('premenstrual');
  });

  it('returns null when mood is flat', () => {
    const days: Day[] = [];
    for (const [cid, start] of [['c1', '2025-01-04'], ['c2', '2025-02-01']] as const) {
      days.push(day(cid, addDay(start, 3), { mood: 3 }));
      days.push(day(cid, addDay(start, 24), { mood: 3 }));
      days.push(day(cid, addDay(start, 26), { mood: 3 }));
    }
    expect(premenstrualInsight(REGULAR, days)).toBeNull();
  });
});

describe('detectPatterns', () => {
  it('aggregates all detectors and never implies causation', () => {
    const days = [
      day('c1', '2025-01-04', { symptoms_json: JSON.stringify(['cramps']), mood: 4 }),
      day('c1', '2025-01-05', { symptoms_json: JSON.stringify(['cramps']) }),
      day('c2', '2025-02-01', { symptoms_json: JSON.stringify(['cramps']) }),
    ];
    const out = detectPatterns(REGULAR, days);
    expect(out.length).toBeGreaterThan(0);
    for (const i of out) expect(i.text.toLowerCase()).not.toContain('causes');
  });
});

function addDay(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d! + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
