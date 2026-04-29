import { describe, expect, test } from 'bun:test';
import {
  crossClusterAcceptancePair,
  foodCluster,
  healthCluster,
  memoryCluster,
  productivityCluster,
  showcaseCatalog,
} from './index.ts';

describe('showcase-catalog — full launch surface (P3 + P4 + P5)', () => {
  test('lists ≥18 showcase apps after the P4 micro-loggers + productivity + memory tracks', () => {
    expect(showcaseCatalog.length).toBeGreaterThanOrEqual(18);
  });

  test('splits across the four clusters', () => {
    expect(foodCluster.length).toBe(4);
    // health absorbs the 5 P4A micro-loggers + the original 4
    expect(healthCluster.length).toBeGreaterThanOrEqual(8);
    expect(productivityCluster.length).toBeGreaterThanOrEqual(3);
    expect(memoryCluster.length).toBeGreaterThanOrEqual(2);
  });

  test('every entry has an acceptance assertion', () => {
    for (const entry of showcaseCatalog) {
      expect(entry.proves.assertion.length).toBeGreaterThan(20);
    }
  });

  test('every entry has a unique id', () => {
    const ids = new Set(showcaseCatalog.map((e) => e.id));
    expect(ids.size).toBe(showcaseCatalog.length);
  });

  test('cross-cluster acceptance pair connects food → health', () => {
    const provider = showcaseCatalog.find((e) => e.id === crossClusterAcceptancePair.provider);
    const consumer = showcaseCatalog.find((e) => e.id === crossClusterAcceptancePair.consumer);
    expect(provider?.cluster).toBe('food');
    expect(consumer?.cluster).toBe('health');
    expect(provider?.intents?.provides).toContain(crossClusterAcceptancePair.intent);
    expect(consumer?.intents?.consumes).toContain(crossClusterAcceptancePair.intent);
  });

  test('every consume intent has a matching provide somewhere in the catalog', () => {
    const provided = new Set<string>();
    for (const entry of showcaseCatalog) {
      for (const p of entry.intents?.provides ?? []) provided.add(p);
    }
    const externallyConsumed = new Set<string>();
    for (const entry of showcaseCatalog) {
      for (const c of entry.intents?.consumes ?? []) externallyConsumed.add(c);
    }
    // budget-limit consumed by Meal Planner with no in-tree producer
    // (planned for a future Budget Tracker showcase).
    const KNOWN_GAPS = new Set(['budget-limit']);
    const missing = [...externallyConsumed].filter(
      (c) => !provided.has(c) && !KNOWN_GAPS.has(c),
    );
    expect(missing).toEqual([]);
  });
});
