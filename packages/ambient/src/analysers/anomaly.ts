/**
 * Z-score anomaly analyser.
 *
 * Computes mean + (population) standard deviation over the chosen numeric
 * field. Emits one Insight per row whose absolute z-score exceeds 2σ:
 *  - 2σ < |z| ≤ 3σ → urgency 'medium'
 *  - |z| > 3σ      → urgency 'high'
 *
 * Sync-only — runs without an open tab and without AI.
 */
import type { Analyser, AnalyserContext, Insight, InsightUrgency } from '../types.ts';

const Z_MED = 2;
const Z_HIGH = 3;

function newId(suffix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `anomaly-${crypto.randomUUID()}`;
  }
  return `anomaly-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${suffix}`;
}

function pickValueField(rows: ReadonlyArray<Record<string, unknown>>): string | null {
  const preferred = ['amount', 'value'];
  for (const row of rows) {
    for (const name of preferred) {
      if (typeof row[name] === 'number' && Number.isFinite(row[name])) {
        return name;
      }
    }
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === 'ts') continue;
      const v = row[key];
      if (typeof v === 'number' && Number.isFinite(v)) return key;
    }
  }
  return null;
}

export const anomalyAnalyser: Analyser = {
  id: 'anomaly',
  syncable: true,
  async run(ctx: AnalyserContext): Promise<Insight[]> {
    const { collection, data, now } = ctx;
    if (data.length < 3) return [];

    const valueField = pickValueField(data);
    if (!valueField) return [];

    const values: number[] = [];
    for (const row of data) {
      const v = row[valueField];
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
    if (values.length < 3) return [];

    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const variance =
      values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
    const stdev = Math.sqrt(variance);
    if (stdev === 0) return [];

    const insights: Insight[] = [];
    let idx = 0;
    for (const row of data) {
      const v = row[valueField];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const z = (v - mean) / stdev;
      const absZ = Math.abs(z);
      if (absZ <= Z_MED) {
        idx += 1;
        continue;
      }
      const urgency: InsightUrgency = absZ > Z_HIGH ? 'high' : 'medium';
      const direction = z > 0 ? 'above' : 'below';
      const tsRaw = row['ts'];
      const ts =
        typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw : now;
      insights.push({
        id: newId(String(idx)),
        collection,
        generatedAt: ts,
        urgency,
        title: `Outlier ${valueField} (${z.toFixed(1)}σ ${direction} mean)`,
        summary: `Observed ${valueField} ${v.toFixed(2)} is ${absZ.toFixed(1)}σ ${direction} the mean of ${mean.toFixed(2)}.`,
      });
      idx += 1;
    }

    return insights;
  },
};
