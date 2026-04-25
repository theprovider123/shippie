/**
 * SVG geometry helpers for the sentiment trend chart. Pure math —
 * separated from the React component so it's trivial to test.
 */
import type { JournalEntry, SentimentLabel } from '../db/schema.ts';

export interface ChartPoint {
  x: number;
  y: number;
  date: string;
  score: number;
  label: SentimentLabel;
}

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartGeometryOptions {
  width: number;
  height: number;
  padding: ChartPadding;
}

const DEFAULT_PADDING: ChartPadding = { top: 16, right: 16, bottom: 16, left: 16 };

export interface ChartGeometry {
  path: string;
  areaPath: string;
}

/** Take the most recent 90 entries with a numeric sentiment, sorted oldest-first. */
export function downsampleSentiment(entries: JournalEntry[], cap = 90): ChartPoint[] {
  const filtered = entries
    .filter((e) => typeof e.sentiment === 'number' && Number.isFinite(e.sentiment))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .slice(-cap);
  if (filtered.length === 0) return [];

  // X is index-based (0..n-1) so spacing reads consistently.
  return filtered.map((entry, i) => {
    const score = clamp(entry.sentiment as number, -1, 1);
    return {
      x: i,
      y: score,
      score,
      date: entry.created_at ?? new Date().toISOString(),
      label: (entry.sentiment_label as SentimentLabel | null) ?? labelFromScore(score),
    };
  });
}

export function labelFromScore(score: number): SentimentLabel {
  if (score > 0.15) return 'positive';
  if (score < -0.15) return 'negative';
  return 'neutral';
}

export function computeChartGeometry(
  points: ChartPoint[],
  opts: Partial<ChartGeometryOptions> = {},
): ChartGeometry & { points: ChartPoint[] } {
  const width = opts.width ?? 600;
  const height = opts.height ?? 200;
  const padding = { ...DEFAULT_PADDING, ...opts.padding };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (points.length === 0) {
    return { path: '', areaPath: '', points: [] };
  }

  const maxX = Math.max(1, points.length - 1);
  const projected: ChartPoint[] = points.map((p) => ({
    ...p,
    x: padding.left + (p.x / maxX) * innerW,
    y: padding.top + (1 - (p.score + 1) / 2) * innerH,
  }));

  const path = projected
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const baseY = padding.top + innerH;
  const areaPath =
    projected.length > 1
      ? `M${projected[0]!.x.toFixed(2)} ${baseY.toFixed(2)} ` +
        projected.map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') +
        ` L${projected[projected.length - 1]!.x.toFixed(2)} ${baseY.toFixed(2)} Z`
      : '';

  return { path, areaPath, points: projected };
}

export function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
