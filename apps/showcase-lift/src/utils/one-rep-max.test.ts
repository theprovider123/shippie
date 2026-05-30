import { describe, expect, it } from 'bun:test';
import { bestEstimatedOneRepMax, estimateOneRepMax, loadForReps } from './one-rep-max.ts';

describe('estimateOneRepMax', () => {
  it('returns the weight itself for a single rep', () => {
    const r = estimateOneRepMax(100, 1);
    expect(r.estimate).toBe(100);
    expect(r.reliable).toBe(true);
  });

  it('estimates above the working weight for multi-rep sets', () => {
    const r = estimateOneRepMax(100, 5);
    // Epley: 100*(1+5/30)=116.67; Brzycki: 100*36/32=112.5; blend ≈ 114.6
    expect(r.estimate).toBeGreaterThan(110);
    expect(r.estimate).toBeLessThan(118);
    expect(r.epley).toBeGreaterThan(r.brzycki);
  });

  it('flags unreliable for high-rep sets but still computes', () => {
    const r = estimateOneRepMax(60, 20);
    expect(r.reliable).toBe(false);
    expect(r.estimate).toBeGreaterThan(60);
  });

  it('guards against zero / negative input', () => {
    expect(estimateOneRepMax(0, 5).estimate).toBe(0);
    expect(estimateOneRepMax(100, 0).estimate).toBe(0);
  });
});

describe('bestEstimatedOneRepMax', () => {
  it('takes the strongest set', () => {
    const best = bestEstimatedOneRepMax([
      { weight: 100, reps: 5 },
      { weight: 120, reps: 1 },
      { weight: 90, reps: 8 },
    ]);
    expect(best).toBeGreaterThanOrEqual(120);
  });

  it('is zero for no sets', () => {
    expect(bestEstimatedOneRepMax([])).toBe(0);
  });
});

describe('loadForReps', () => {
  it('inverts Epley — round-trips roughly back to the working weight', () => {
    const e1rm = estimateOneRepMax(100, 5).epley;
    expect(loadForReps(e1rm, 5)).toBeCloseTo(100, 0);
  });

  it('returns the 1RM itself for a single rep', () => {
    expect(loadForReps(150, 1)).toBe(150);
  });
});
