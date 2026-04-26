import { describe, expect, it } from 'bun:test';
import { trendAnalyser } from './trend.ts';
import type { AnalyserContext } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function ctx(data: Record<string, unknown>[], now = NOW): AnalyserContext {
  return { collection: 'spending', data, now };
}

/** Build 14 days of synthetic numeric data:
 *  - days [now-14d, now-7d) get `priorPerDay` per day
 *  - days [now-7d, now)     get `lastPerDay` per day
 *  Each day has one entry, value field is `amount`.
 */
function series(priorPerDay: number, lastPerDay: number, field = 'amount') {
  const rows: Record<string, unknown>[] = [];
  for (let d = 14; d >= 1; d--) {
    const ts = NOW - d * DAY_MS + 60_000; // 1 minute into the day-bucket
    const value = d > 7 ? priorPerDay : lastPerDay;
    rows.push({ ts, [field]: value });
  }
  return rows;
}

describe('trendAnalyser', () => {
  it('emits a medium-urgency insight when last 7d sum is >30% above prior 7d', async () => {
    // prior=100/day*7=700, last=200/day*7=1400 → +100% delta.
    const out = await trendAnalyser.run(ctx(series(100, 200)));
    expect(out).toHaveLength(1);
    const insight = out[0]!;
    expect(insight.urgency).toBe('medium');
    expect(insight.collection).toBe('spending');
    expect(insight.id.length).toBeGreaterThan(0);
    expect(insight.generatedAt).toBe(NOW);
    expect(insight.title.toLowerCase()).toContain('up');
    expect(insight.summary.length).toBeGreaterThan(0);
  });

  it('emits an insight when trending down >30%', async () => {
    // prior=100/day, last=50/day → -50% delta.
    const out = await trendAnalyser.run(ctx(series(100, 50)));
    expect(out).toHaveLength(1);
    expect(out[0]!.title.toLowerCase()).toContain('down');
  });

  it('does not emit when the trend is flat (within 30%)', async () => {
    // prior=100, last=110 → +10%.
    const out = await trendAnalyser.run(ctx(series(100, 110)));
    expect(out).toEqual([]);
  });

  it('does not emit when there is less than 14 days of data', async () => {
    // Only the last 7 days populated.
    const rows: Record<string, unknown>[] = [];
    for (let d = 7; d >= 1; d--) {
      rows.push({ ts: NOW - d * DAY_MS + 60_000, amount: 100 });
    }
    const out = await trendAnalyser.run(ctx(rows));
    expect(out).toEqual([]);
  });

  it('does not emit when there is no data', async () => {
    const out = await trendAnalyser.run(ctx([]));
    expect(out).toEqual([]);
  });

  it('auto-detects the value field when neither amount nor value is present', async () => {
    // Use `mood` as the numeric field — the analyser should pick it up.
    const out = await trendAnalyser.run(ctx(series(2, 5, 'mood')));
    expect(out).toHaveLength(1);
    expect(out[0]!.summary).toContain('mood');
  });

  it('does not emit when no numeric field is available', async () => {
    const rows: Record<string, unknown>[] = [];
    for (let d = 14; d >= 1; d--) {
      rows.push({ ts: NOW - d * DAY_MS + 60_000, note: 'hi' });
    }
    const out = await trendAnalyser.run(ctx(rows));
    expect(out).toEqual([]);
  });

  it('does not emit when the prior-window sum is zero (no division)', async () => {
    const rows: Record<string, unknown>[] = [];
    for (let d = 14; d >= 1; d--) {
      const value = d > 7 ? 0 : 100;
      rows.push({ ts: NOW - d * DAY_MS + 60_000, amount: value });
    }
    const out = await trendAnalyser.run(ctx(rows));
    expect(out).toEqual([]);
  });
});
