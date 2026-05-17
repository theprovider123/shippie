import { describe, expect, test } from 'bun:test';
import { search, tokenize, type SearchableMemo } from './search.ts';

const memos: SearchableMemo[] = [
  {
    id: 'm1',
    transcript: 'Remember to buy oat milk and pick up the dry cleaning before five.',
    tags: ['errands'],
    recorded_at: '2026-05-01T12:00:00Z',
  },
  {
    id: 'm2',
    transcript: 'Idea for the showcase: a hold-to-record voice memo with on-device whisper.',
    tags: ['ideas', 'shippie'],
    recorded_at: '2026-05-03T09:30:00Z',
  },
  {
    id: 'm3',
    transcript: 'Tomorrow I should call Mom and ask about the recipe.',
    tags: ['family'],
    recorded_at: '2026-05-02T18:45:00Z',
  },
  {
    id: 'm4',
    transcript: 'Quick reminder: rebook the dentist appointment.',
    tags: [],
    recorded_at: '2026-05-04T08:00:00Z',
  },
];

describe('search · tokenize', () => {
  test('lowercases and splits on non-alphanumerics', () => {
    expect(tokenize("Hello, World! It's 2026.")).toEqual(['hello', 'world', 'it', 's', '2026']);
  });

  test('strips diacritics so accented words still match', () => {
    expect(tokenize('café façade')).toEqual(['cafe', 'facade']);
  });

  test('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('search · query', () => {
  test('empty query returns all memos in recency order', () => {
    const results = search(memos, '');
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.memo.id)).toEqual(['m4', 'm2', 'm3', 'm1']);
  });

  test('substring match scores higher than token match', () => {
    const results = search(memos, 'oat milk');
    expect(results[0]?.memo.id).toBe('m1');
    expect(results[0]?.score).toBeGreaterThan(50);
  });

  test('multi-word token match (any order) ranks higher than single-token', () => {
    const results = search(memos, 'whisper showcase');
    expect(results[0]?.memo.id).toBe('m2');
  });

  test('single-token match still surfaces the right memo', () => {
    const results = search(memos, 'dentist');
    expect(results.map((r) => r.memo.id)).toEqual(['m4']);
  });

  test('tag match boosts a memo even when not in the transcript', () => {
    const results = search(memos, 'family');
    expect(results[0]?.memo.id).toBe('m3');
  });

  test('no matches returns an empty array', () => {
    const results = search(memos, 'asparagus');
    expect(results).toEqual([]);
  });

  test('results are deterministic by score then recency', () => {
    const results = search(memos, 'the');
    // 'the' appears in m1, m2, m3, m4. Same single-token score, so
    // ordering falls through to recorded_at desc.
    expect(results.map((r) => r.memo.id)).toEqual(['m4', 'm2', 'm3', 'm1']);
  });
});
