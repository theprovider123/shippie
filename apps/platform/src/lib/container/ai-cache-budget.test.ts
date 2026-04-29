/**
 * P1B — AI cache budget invariants.
 *
 *   1. Adding a model under the budget never evicts anything.
 *   2. Adding a model that would push past the budget evicts in LRU
 *      order — least recently used first.
 *   3. `touch` updates LRU order so a recently-used model survives an
 *      otherwise-fatal eviction round.
 *   4. A model that's individually larger than the entire budget is
 *      rejected at `put` time (caller falls through to edge instead of
 *      evicting everything in a doomed attempt to seat it).
 *
 * The module is pure — no Cache Storage I/O — so all four can run as
 * synchronous vitest cases.
 */
import { describe, expect, test } from 'vitest';
import {
  createAiCacheBudget,
  DEFAULT_AI_CACHE_BUDGET_BYTES,
} from './ai-cache-budget';

const MB = 1024 * 1024;

describe('AI cache budget — LRU eviction', () => {
  test('adding under budget does not require eviction', () => {
    const b = createAiCacheBudget({ maxBytes: 100 * MB });
    b.put('a', 30 * MB);
    b.put('b', 30 * MB);
    expect(b.planEviction(20 * MB)).toEqual([]);
    expect(b.totalBytes()).toBe(60 * MB);
  });

  test('exceeding budget evicts least-recently-used first', () => {
    let now = 0;
    const b = createAiCacheBudget({ maxBytes: 100 * MB, now: () => now });
    now = 1; b.put('a', 40 * MB); // oldest
    now = 2; b.put('b', 40 * MB);
    now = 3; b.put('c', 20 * MB); // newest
    // Need 30 MB headroom — must evict at least 'a' (40 MB freed).
    expect(b.planEviction(30 * MB)).toEqual(['a']);
  });

  test('touch promotes a model so a more-recent victim is chosen instead', () => {
    let now = 0;
    const b = createAiCacheBudget({ maxBytes: 100 * MB, now: () => now });
    now = 1; b.put('a', 40 * MB);
    now = 2; b.put('b', 40 * MB);
    now = 3; b.put('c', 20 * MB);
    now = 4; b.touch('a'); // a is now newest, b is oldest
    expect(b.planEviction(30 * MB)).toEqual(['b']);
  });

  test('cascading eviction frees enough room across multiple LRU victims', () => {
    let now = 0;
    const b = createAiCacheBudget({ maxBytes: 100 * MB, now: () => now });
    now = 1; b.put('a', 30 * MB);
    now = 2; b.put('b', 30 * MB);
    now = 3; b.put('c', 30 * MB);
    expect(b.totalBytes()).toBe(90 * MB);
    // Need 50 MB — can't fit just by evicting a (30); also evict b (60 freed).
    expect(b.planEviction(50 * MB)).toEqual(['a', 'b']);
  });

  test('put rejects a single model that would never fit', () => {
    const b = createAiCacheBudget({ maxBytes: 100 * MB });
    expect(() => b.put('whisper', 200 * MB)).toThrow(/exceed cache budget/);
  });

  test('default budget matches the planned q8 footprint', () => {
    const b = createAiCacheBudget();
    expect(b.maxBytes()).toBe(DEFAULT_AI_CACHE_BUDGET_BYTES);
    expect(DEFAULT_AI_CACHE_BUDGET_BYTES / MB).toBe(225);
  });

  test('delete drops the entry and clear empties everything', () => {
    const b = createAiCacheBudget({ maxBytes: 100 * MB });
    b.put('a', 30 * MB);
    b.put('b', 30 * MB);
    b.delete('a');
    expect(b.totalBytes()).toBe(30 * MB);
    b.clear();
    expect(b.totalBytes()).toBe(0);
    expect(b.entries()).toEqual([]);
  });

  test('planEviction returns empty when no entries yet', () => {
    const b = createAiCacheBudget({ maxBytes: 100 * MB });
    expect(b.planEviction(50 * MB)).toEqual([]);
  });
});
