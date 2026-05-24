/**
 * Tag helpers — pure-data + AI suggestion shape.
 */
import { describe, expect, test } from 'bun:test';
import type { SavedArticle } from './types.ts';
import {
  addTag,
  aggregateTags,
  dedupeTags,
  filterByTag,
  normaliseTag,
  removeTag,
  suggestLabel,
  SUGGESTED_LABELS,
} from './tags.ts';

function fakeArticle(partial: Partial<SavedArticle> = {}): SavedArticle {
  return {
    id: 'a_1',
    url: 'https://example.com',
    title: 'Test',
    contentHtml: '',
    plainText: '',
    readMinutes: 1,
    wordCount: 0,
    savedAt: '2026-05-01T00:00:00.000Z',
    ...partial,
  };
}

describe('normaliseTag', () => {
  test('lowercases and replaces whitespace with hyphens', () => {
    expect(normaliseTag('Tech News')).toBe('tech-news');
  });
  test('strips non-alphanumerics except hyphen', () => {
    expect(normaliseTag('AI/ML 🚀')).toBe('aiml');
  });
  test('caps length at 24', () => {
    expect(normaliseTag('a'.repeat(50)).length).toBe(24);
  });
});

describe('dedupeTags', () => {
  test('keeps first instance, drops empties + dupes', () => {
    expect(dedupeTags(['Tech', 'tech', '', 'Science'])).toEqual(['tech', 'science']);
  });
});

describe('addTag / removeTag', () => {
  test('addTag is idempotent', () => {
    const a = addTag(fakeArticle(), 'tech');
    const b = addTag(a, 'tech');
    expect(b.tags).toEqual(['tech']);
    expect(b).toBe(a); // same object — no churn
  });

  test('removeTag drops the tag if present, no-ops otherwise', () => {
    const a = addTag(fakeArticle(), 'tech');
    expect(removeTag(a, 'tech').tags).toEqual([]);
    expect(removeTag(a, 'science').tags).toEqual(['tech']);
  });
});

describe('aggregateTags', () => {
  test('sorts by count desc, then alpha', () => {
    const articles = [
      fakeArticle({ id: 'a1', tags: ['tech', 'science'] }),
      fakeArticle({ id: 'a2', tags: ['tech'] }),
      fakeArticle({ id: 'a3', tags: ['business'] }),
    ];
    expect(aggregateTags(articles)).toEqual([
      { tag: 'tech', count: 2 },
      { tag: 'business', count: 1 },
      { tag: 'science', count: 1 },
    ]);
  });
});

describe('filterByTag', () => {
  test('returns all articles when filter is null', () => {
    const articles = [fakeArticle({ id: 'a1' }), fakeArticle({ id: 'a2' })];
    expect(filterByTag(articles, null).length).toBe(2);
  });

  test('returns only articles carrying the tag', () => {
    const articles = [
      fakeArticle({ id: 'a1', tags: ['tech'] }),
      fakeArticle({ id: 'a2', tags: ['business'] }),
    ];
    expect(filterByTag(articles, 'tech').map((a) => a.id)).toEqual(['a1']);
  });
});

describe('suggestLabel', () => {
  test('returns the AI-picked label when worker is local', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'classify' as const,
          output: { label: 'tech' as const },
          source: 'local' as const,
        }),
        ready: async () => undefined,
        capabilities: async () => ({ availableTasks: [] }),
        preload: async () => undefined,
      },
    };
    const label = await suggestLabel(fakeShippie, { title: 'GPU drivers', plainText: 'CUDA' });
    expect(label).toBe('tech');
  });

  test('returns null when the worker is unavailable', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'classify' as const,
          output: null,
          source: 'unavailable' as const,
        }),
        ready: async () => undefined,
        capabilities: async () => ({ availableTasks: [] }),
        preload: async () => undefined,
      },
    };
    expect(await suggestLabel(fakeShippie, { title: 'X', plainText: 'Y' })).toBeNull();
  });

  test('rejects out-of-set labels rather than passing them through', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'classify' as const,
          output: { label: 'sports' },
          source: 'local' as const,
        }),
        ready: async () => undefined,
        capabilities: async () => ({ availableTasks: [] }),
        preload: async () => undefined,
      },
    };
    expect(await suggestLabel(fakeShippie, { title: 'X', plainText: 'Y' })).toBeNull();
  });

  test('exposes a finite, sane label set', () => {
    expect(SUGGESTED_LABELS.length).toBeGreaterThan(0);
    expect(SUGGESTED_LABELS).toContain('tech');
    expect(SUGGESTED_LABELS).toContain('news');
  });
});
