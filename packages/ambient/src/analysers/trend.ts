/**
 * Week-over-week trend analyser.
 *
 * Given a numeric collection with a `ts` field (epoch ms) and a numeric value
 * field (auto-detected — first numeric field that isn't `ts`, or 'amount' /
 * 'value' by default), compares the sum of the last 7 days to the sum of the
 * prior 7 days. When the relative delta exceeds 30%, emits a single Insight
 * with `urgency: 'medium'`.
 *
 * Sync-only — runs without an open tab and without AI.
 */
import type { Analyser, AnalyserContext, Insight } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 7 * DAY_MS;
const DELTA_THRESHOLD = 0.3;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `trend-${crypto.randomUUID()}`;
  }
  return `trend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickValueField(rows: ReadonlyArray<Record<string, unknown>>): string | null {
  // Prefer common, well-known names if present and numeric.
  const preferred = ['amount', 'value'];
  for (const row of rows) {
    for (const name of preferred) {
      if (typeof row[name] === 'number' && Number.isFinite(row[name])) {
        return name;
      }
    }
  }
  // Fall back: the first non-`ts` numeric field on the first row that has one.
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === 'ts') continue;
      const v = row[key];
      if (typeof v === 'number' && Number.isFinite(v)) return key;
    }
  }
  return null;
}

function formatPct(delta: number): string {
  const pct = Math.round(Math.abs(delta) * 100);
  return `${pct}%`;
}

export const trendAnalyser: Analyser = {
  id: 'trend',
  syncable: true,
  async run(ctx: AnalyserContext): Promise<Insight[]> {
    const { collection, data, now } = ctx;
    if (data.length === 0) return [];

    const valueField = pickValueField(data);
    if (!valueField) return [];

    const lastStart = now - WINDOW_MS;
    const priorStart = now - 2 * WINDOW_MS;

    let lastSum = 0;
    let priorSum = 0;
    let lastCount = 0;
    let priorCount = 0;
    const distinctDays = new Set<number>();

    for (const row of data) {
      const tsRaw = row['ts'];
      const ts = typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw : null;
      if (ts === null) continue;
      const valueRaw = row[valueField];
      const value =
        typeof valueRaw === 'number' && Number.isFinite(valueRaw) ? valueRaw : null;
      if (value === null) continue;

      // Only events within the 14-day window contribute.
      if (ts < priorStart || ts >= now) continue;
      distinctDays.add(Math.floor(ts / DAY_MS));

      if (ts >= lastStart) {
        lastSum += value;
        lastCount += 1;
      } else {
        priorSum += value;
        priorCount += 1;
      }
    }

    // Need at least some coverage in BOTH halves to make a comparison; and
    // we want roughly two weeks of data to avoid noisy week-1 baselines.
    if (lastCount === 0 || priorCount === 0) return [];
    if (distinctDays.size < 14) return [];
    if (priorSum === 0) return [];

    const delta = (lastSum - priorSum) / priorSum;
    if (Math.abs(delta) <= DELTA_THRESHOLD) return [];

    const direction = delta > 0 ? 'up' : 'down';
    const friendlyField =
      valueField.charAt(0).toUpperCase() + valueField.slice(1);

    return [
      {
        id: newId(),
        collection,
        generatedAt: now,
        urgency: 'medium',
        title: `${friendlyField} ${direction} ${formatPct(delta)}`,
        summary: `${friendlyField} is ${direction} ${formatPct(delta)} compared to the previous 7 days (${valueField} field).`,
      },
    ];
  },
};
