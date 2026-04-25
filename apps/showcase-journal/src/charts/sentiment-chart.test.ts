import { describe, expect, it } from 'bun:test';
import { clamp, computeChartGeometry, downsampleSentiment, labelFromScore } from './sentiment-chart.ts';

describe('clamp', () => {
  it('caps to range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
  it('handles NaN', () => {
    expect(clamp(Number.NaN, -1, 1)).toBe(0);
  });
});

describe('labelFromScore', () => {
  it('maps to the right band', () => {
    expect(labelFromScore(0.5)).toBe('positive');
    expect(labelFromScore(-0.5)).toBe('negative');
    expect(labelFromScore(0)).toBe('neutral');
    expect(labelFromScore(0.05)).toBe('neutral');
  });
});

describe('downsampleSentiment', () => {
  it('drops entries with no sentiment', () => {
    const points = downsampleSentiment([
      { id: '1', body: 'a', sentiment: 0.5, created_at: '2026-01-01' },
      { id: '2', body: 'b', created_at: '2026-01-02' },
      { id: '3', body: 'c', sentiment: -0.2, created_at: '2026-01-03' },
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]!.score).toBe(0.5);
    expect(points[1]!.score).toBe(-0.2);
  });

  it('sorts oldest-first and trims to cap', () => {
    const entries = Array.from({ length: 120 }, (_, i) => ({
      id: String(i),
      body: '',
      sentiment: i % 2 === 0 ? 0.4 : -0.4,
      created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:${String(i).padStart(2, '0')}Z`,
    }));
    const points = downsampleSentiment(entries, 60);
    expect(points).toHaveLength(60);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.date >= points[i - 1]!.date).toBe(true);
    }
  });
});

describe('computeChartGeometry', () => {
  it('returns empty paths for empty input', () => {
    const out = computeChartGeometry([]);
    expect(out.path).toBe('');
    expect(out.areaPath).toBe('');
  });

  it('projects scores within the chart bounds', () => {
    const points = [
      { x: 0, y: 1, score: 1, date: '2026-01-01', label: 'positive' as const },
      { x: 1, y: 0, score: 0, date: '2026-01-02', label: 'neutral' as const },
      { x: 2, y: -1, score: -1, date: '2026-01-03', label: 'negative' as const },
    ];
    const opts = { width: 200, height: 100, padding: { top: 10, right: 10, bottom: 10, left: 10 } };
    const out = computeChartGeometry(points, opts);
    expect(out.path).toContain('M');
    expect(out.path).toContain('L');
    // Area path is a closed shape ending in Z
    expect(out.areaPath.endsWith('Z')).toBe(true);
    // Both endpoints should clamp inside [padding, width-padding]
    expect(out.path).toMatch(/M10\.00 /); // first point at left padding
  });
});
