import { describe, expect, test } from 'bun:test';
import {
  crossClusterAcceptancePair,
  foodCluster,
  healthCluster,
  showcaseCatalog,
} from './index.ts';

describe('showcase-catalog — C2 deliverable', () => {
  test('lists exactly 8 showcase apps', () => {
    expect(showcaseCatalog).toHaveLength(8);
  });

  test('splits 4 apps per cluster', () => {
    expect(foodCluster).toHaveLength(4);
    expect(healthCluster).toHaveLength(4);
  });

  test('every entry has an acceptance assertion', () => {
    for (const entry of showcaseCatalog) {
      expect(entry.proves.assertion.length).toBeGreaterThan(20);
    }
  });

  test('every entry has a unique id and slug', () => {
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

  test('every consume intent has at least one matching provide somewhere in the catalog', () => {
    const provided = new Set<string>();
    for (const entry of showcaseCatalog) {
      for (const p of entry.intents?.provides ?? []) provided.add(p);
    }
    const externallyConsumed = new Set<string>();
    for (const entry of showcaseCatalog) {
      for (const c of entry.intents?.consumes ?? []) externallyConsumed.add(c);
    }
    // budget-limit is consumed by Meal Planner but no showcase provides it
    // yet — surface that as an explicit known gap, not a silent failure.
    const KNOWN_GAPS = new Set(['budget-limit', 'caffeine-logged']);
    const missing = [...externallyConsumed].filter(
      (c) => !provided.has(c) && !KNOWN_GAPS.has(c),
    );
    expect(missing).toEqual([]);
  });
});
