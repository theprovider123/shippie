import { describe, expect, it } from 'bun:test';
import { anomalyAnalyser } from './anomaly.ts';
import type { AnalyserContext } from '../types.ts';

const NOW = 1_700_000_000_000;

function ctx(data: Record<string, unknown>[], now = NOW): AnalyserContext {
  return { collection: 'spending', data, now };
}

describe('anomalyAnalyser', () => {
  it('emits a high-urgency insight for a >3σ outlier', async () => {
    // 30 baseline values around 100 with tight spread, plus one extreme spike.
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({ ts: NOW - i * 1000, amount: 100 + ((i % 3) - 1) }); // 99,100,101 cycle
    }
    rows.push({ ts: NOW, amount: 1000 });
    const out = await anomalyAnalyser.run(ctx(rows));
    expect(out.length).toBeGreaterThanOrEqual(1);
    const high = out.find((i) => i.urgency === 'high');
    expect(high).toBeDefined();
    expect(high!.collection).toBe('spending');
    expect(high!.id.length).toBeGreaterThan(0);
    expect(high!.title.toLowerCase()).toContain('outlier');
  });

  it('emits a medium-urgency insight for a 2-3σ outlier', async () => {
    // Construct a series where one value sits between 2σ and 3σ from the mean.
    // Baseline: 19 zeros. Insert one value of 2.5 → mean ≈ 0.125, stdev ≈ 0.55,
    // z ≈ 4.3 — that would be 'high'. We instead use a wider baseline.
    const rows: Record<string, unknown>[] = [];
    // 50 values normally distributed-ish around 100 with stdev ≈ 10.
    const baseline = [
      90, 95, 100, 105, 110, 92, 98, 102, 108, 88, 94, 99, 101, 107, 91, 96, 103, 106, 89,
      93, 97, 100, 104, 109, 87, 95, 100, 105, 110, 92, 98, 102, 108, 88, 94, 99, 101,
      107, 91, 96, 103, 106, 89, 93, 97, 100, 104, 109, 87, 95,
    ];
    baseline.forEach((v, i) => rows.push({ ts: NOW - i * 1000, amount: v }));
    // Push a value ~ 2.5σ above the mean (~100). With stdev ≈ 6.7, ~2.5σ ≈ 117.
    rows.push({ ts: NOW, amount: 117 });
    const out = await anomalyAnalyser.run(ctx(rows));
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.some((i) => i.urgency === 'medium')).toBe(true);
    expect(out.every((i) => i.urgency !== 'low')).toBe(true);
  });

  it('does not emit on a tight, normally-distributed series with no outliers', async () => {
    const rows: Record<string, unknown>[] = [];
    // Symmetric values around 100, all within ~1σ.
    const values = [98, 99, 100, 101, 102, 99, 100, 101, 98, 102, 100, 99, 101, 100, 100];
    values.forEach((v, i) => rows.push({ ts: NOW - i * 1000, amount: v }));
    const out = await anomalyAnalyser.run(ctx(rows));
    expect(out).toEqual([]);
  });

  it('returns empty when there is too little data', async () => {
    const out = await anomalyAnalyser.run(ctx([{ ts: NOW, amount: 1 }]));
    expect(out).toEqual([]);
  });

  it('returns empty when stdev is zero (all values equal)', async () => {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 10; i++) rows.push({ ts: NOW - i * 1000, amount: 100 });
    const out = await anomalyAnalyser.run(ctx(rows));
    expect(out).toEqual([]);
  });

  it('returns empty when no numeric field is available', async () => {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 10; i++) rows.push({ ts: NOW - i * 1000, note: 'x' });
    const out = await anomalyAnalyser.run(ctx(rows));
    expect(out).toEqual([]);
  });

  it('auto-detects a non-amount/value numeric field', async () => {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 30; i++) rows.push({ ts: NOW - i * 1000, mood: 5 + ((i % 3) - 1) });
    rows.push({ ts: NOW, mood: 50 });
    const out = await anomalyAnalyser.run(ctx(rows));
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]!.summary).toContain('mood');
  });
});
