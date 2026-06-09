import { describe, expect, it } from 'bun:test';
import { derivePalate } from './profile.ts';
import type { CupScore } from '../types.ts';

function cup(partial: Partial<CupScore> & { id: string; createdAt: string }): CupScore {
  return {
    bagId: 'bag1',
    brightness: 5,
    body: 5,
    sweetness: 5,
    complexity: 5,
    clean: 5,
    tasteNotes: [],
    published: true,
    ...partial,
  };
}

describe('derivePalate', () => {
  it('returns a zeroed profile with no cups', () => {
    const p = derivePalate([]);
    expect(p.sampleCount).toBe(0);
    expect(p.scores).toEqual([0, 0, 0, 0, 0]);
    expect(p.tendency).toContain('No cups');
  });

  it('maps a 1–10 score into 0–5 radar space', () => {
    const p = derivePalate([cup({ id: 'c1', createdAt: '2026-06-01', brightness: 10, body: 2 })]);
    // brightness 10 → 5.0, body 2 → 1.0
    expect(p.axes.brightness).toBe(5);
    expect(p.axes.body).toBe(1);
    expect(p.labels[0]).toBe('Brightness');
  });

  it('weights recent cups more heavily', () => {
    const old = cup({ id: 'old', createdAt: '2025-01-01', brightness: 2 });
    const recent = cup({ id: 'new', createdAt: '2026-06-01', brightness: 10 });
    const p = derivePalate([old, recent]);
    // Recency-weighted brightness should sit closer to the recent 5.0 than the
    // simple mean of (1.0, 5.0) = 3.0.
    expect(p.axes.brightness).toBeGreaterThan(3);
  });

  it('describes the dominant axes in plain English', () => {
    const p = derivePalate([
      cup({ id: 'c1', createdAt: '2026-06-01', brightness: 9, clean: 9, body: 3 }),
    ]);
    expect(p.tendency.toLowerCase()).toContain('bright');
  });
});
