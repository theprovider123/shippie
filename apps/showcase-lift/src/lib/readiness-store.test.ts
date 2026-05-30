import { describe, expect, it } from 'bun:test';
import { applyBroadcast, deriveSignals } from './readiness-store.ts';

const NOW = Date.parse('2026-05-29T18:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('applyBroadcast', () => {
  it('folds a sleep broadcast into the store', () => {
    const store = applyBroadcast({}, 'sleep-logged', [{ sleep_hours: 7, quality: 8 }], NOW);
    expect(store.sleepHours).toEqual({ v: 7, at: NOW });
    expect(store.sleepQuality).toEqual({ v: 8, at: NOW });
  });

  it('accumulates bodyweight history and caps it at six readings', () => {
    let store: ReturnType<typeof applyBroadcast> = {};
    for (let i = 0; i < 8; i++) {
      store = applyBroadcast(store, 'body-metrics-logged', [{ weight_kg: 80 + i }], NOW - i * DAY);
    }
    expect(store.weightHistory).toHaveLength(6);
  });

  it('ignores broadcasts it cannot use', () => {
    const store = applyBroadcast({}, 'body-metrics-logged', [{ junk: 1 }], NOW);
    expect(store.weightHistory).toBeUndefined();
    expect(applyBroadcast({}, 'workout-completed', [{ x: 1 }], NOW)).toEqual({});
  });
});

describe('deriveSignals', () => {
  it('keeps fresh signals and drops stale ones', () => {
    const store = applyBroadcast({}, 'sleep-logged', [{ sleep_hours: 8 }], NOW - 30 * HOUR);
    // 30h old → past the 20h sleep TTL → dropped.
    expect(deriveSignals(store, NOW).sleepHours).toBeUndefined();
    // Within TTL → kept.
    const fresh = applyBroadcast({}, 'sleep-logged', [{ sleep_hours: 8 }], NOW - 6 * HOUR);
    expect(deriveSignals(fresh, NOW).sleepHours).toBe(8);
  });

  it('derives caffeine recency in minutes', () => {
    const store = applyBroadcast({}, 'caffeine-logged', [{ count: 2 }], NOW - 45 * 60 * 1000);
    const sig = deriveSignals(store, NOW);
    expect(sig.caffeineCountToday).toBe(2);
    expect(sig.caffeineRecentMinutes).toBe(45);
  });

  it('computes a bodyweight delta percentage from history', () => {
    let store = applyBroadcast({}, 'body-metrics-logged', [{ weight_kg: 80 }], NOW - 5 * DAY);
    store = applyBroadcast(store, 'body-metrics-logged', [{ weight_kg: 78 }], NOW - 1 * DAY);
    const sig = deriveSignals(store, NOW);
    expect(sig.bodyWeightDeltaPct).toBeCloseTo(-2.5, 1);
  });

  it('needs two readings before reporting a delta', () => {
    const store = applyBroadcast({}, 'body-metrics-logged', [{ weight_kg: 80 }], NOW);
    expect(deriveSignals(store, NOW).bodyWeightDeltaPct).toBeUndefined();
  });

  it('returns an empty signal set for an empty store', () => {
    const sig = deriveSignals({}, NOW);
    expect(Object.values(sig).every((v) => v === undefined)).toBe(true);
  });
});
