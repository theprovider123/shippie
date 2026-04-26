/**
 * Sentiment-trend analyser (AI-backed).
 *
 * Given a text-bearing collection (rows have a `text`, `body`, or `content`
 * field — auto-detected, preferring `text`) and a `ts` field for ordering,
 * calls `ctx.sentiment` for each row, maps the polarity to a numeric score
 * (+1 positive, 0 neutral, -1 negative), buckets entries by ISO week, and
 * computes a least-squares slope across week buckets.
 *
 * When the slope is below -0.3 (i.e. mood trending down), emits a single
 * `urgency: 'medium'` Insight titled "Your mood has trended down this week".
 *
 * `syncable: false` — requires the AI bridge, which only exists when an
 * open tab can reach `ai.shippie.app`. The orchestrator queues this when
 * `ctx.sentiment` is absent.
 */
import type { Analyser, AnalyserContext, Insight } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SLOPE_THRESHOLD = -0.3;
const TEXT_FIELDS = ['text', 'body', 'content'] as const;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sentiment-trend-${crypto.randomUUID()}`;
  }
  return `sentiment-trend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickTextField(rows: ReadonlyArray<Record<string, unknown>>): string | null {
  for (const name of TEXT_FIELDS) {
    for (const row of rows) {
      const v = row[name];
      if (typeof v === 'string' && v.length > 0) return name;
    }
  }
  return null;
}

function polarityToScore(p: 'positive' | 'neutral' | 'negative'): number {
  if (p === 'positive') return 1;
  if (p === 'negative') return -1;
  return 0;
}

/** Slope of `y` w.r.t. `x` via ordinary least squares. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    num += dx * (ys[i]! - meanY);
    den += dx * dx;
  }
  if (den === 0) return 0;
  return num / den;
}

export const sentimentTrendAnalyser: Analyser = {
  id: 'sentiment-trend',
  syncable: false,
  async run(ctx: AnalyserContext): Promise<Insight[]> {
    const { collection, data, now, sentiment } = ctx;
    if (!sentiment) return [];
    if (data.length === 0) return [];

    const textField = pickTextField(data);
    if (!textField) return [];

    type Entry = { ts: number; score: number };
    const entries: Entry[] = [];

    for (const row of data) {
      const tsRaw = row['ts'];
      const ts = typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw : null;
      if (ts === null) continue;
      const textRaw = row[textField];
      if (typeof textRaw !== 'string' || textRaw.length === 0) continue;
      try {
        const result = await sentiment(textRaw);
        entries.push({ ts, score: polarityToScore(result.sentiment) });
      } catch {
        // Skip individual failures; the trend is robust to a missing point.
        continue;
      }
    }

    if (entries.length < 2) return [];

    // Bucket by week index relative to `now`. Week 0 = the 7 days ending at
    // `now`, week 1 = the prior 7 days, etc. We feed the regression in
    // chronological order (oldest first) so a downward slope means scores
    // decrease as time advances.
    const buckets = new Map<number, number[]>();
    for (const e of entries) {
      const ageMs = now - e.ts;
      if (ageMs < 0) continue;
      const weekFromNow = Math.floor(ageMs / WEEK_MS);
      const arr = buckets.get(weekFromNow);
      if (arr) arr.push(e.score);
      else buckets.set(weekFromNow, [e.score]);
    }

    if (buckets.size < 2) return [];

    // Convert to chronological (oldest = highest weekFromNow first) and use
    // negative weekFromNow as the x-axis so x increases with time.
    const sortedWeeks = [...buckets.keys()].sort((a, b) => b - a);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const w of sortedWeeks) {
      const scores = buckets.get(w)!;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      xs.push(-w);
      ys.push(avg);
    }

    const m = slope(xs, ys);
    if (m >= SLOPE_THRESHOLD) return [];

    return [
      {
        id: newId(),
        collection,
        generatedAt: now,
        urgency: 'medium',
        title: 'Your mood has trended down this week',
        summary: `Across ${entries.length} entries the weekly sentiment slope is ${m.toFixed(
          2,
        )} (negative = trending down).`,
      },
    ];
  },
};
