/**
 * Search tests — substring scan, ranking, snippets.
 */
import { describe, expect, test } from 'bun:test';
import type { Highlight, SavedArticle } from './types.ts';
import { makeSnippet, search, searchHighlights } from './search.ts';

function article(partial: Partial<SavedArticle>): SavedArticle {
  return {
    id: 'a',
    url: 'https://example.com',
    title: 'Untitled',
    contentHtml: '',
    plainText: '',
    readMinutes: 1,
    wordCount: 0,
    savedAt: '2026-05-01T00:00:00.000Z',
    ...partial,
  };
}

describe('search', () => {
  test('returns empty for an empty query', () => {
    expect(search('', [article({})])).toEqual([]);
  });

  test('matches title and ranks higher than body', () => {
    const articles = [
      article({ id: 'a1', title: 'Climate report', plainText: 'something else' }),
      article({ id: 'a2', title: 'Other', plainText: 'climate change is real' }),
    ];
    const results = search('climate', articles);
    expect(results.map((r) => r.article.id)).toEqual(['a1', 'a2']);
    expect(results[0]!.matchedIn).toBe('title');
    expect(results[1]!.matchedIn).toBe('body');
  });

  test('emits a snippet around body matches', () => {
    const body = `${'x'.repeat(200)} the climate term is here ${'y'.repeat(200)}`;
    const results = search('climate', [article({ id: 'a1', plainText: body })]);
    expect(results.length).toBe(1);
    expect(results[0]!.snippet).toContain('climate');
    expect(results[0]!.snippet).toContain('…');
  });

  test('matches highlighted snippets and tags', () => {
    const articles = [article({ id: 'a1', title: 'Plain', plainText: 'no signal here', tags: ['business'] })];
    const highlights: Highlight[] = [
      { id: 'h1', articleId: 'a1', text: 'a quote about climate science', createdAt: '2026-05-01' },
    ];

    const climateResults = search('climate', articles, highlights);
    expect(climateResults[0]!.matchedIn).toBe('highlight');

    const tagResults = search('business', articles);
    expect(tagResults[0]!.matchedIn).toBe('tag');
  });

  test('is case-insensitive', () => {
    const results = search('CLIMATE', [article({ id: 'a1', title: 'climate report' })]);
    expect(results.length).toBe(1);
  });
});

describe('searchHighlights', () => {
  test('finds highlight text and notes across the whole library', () => {
    const articles = [article({ id: 'a1', title: 'A' })];
    const highlights: Highlight[] = [
      { id: 'h1', articleId: 'a1', text: 'glaciers retreat', createdAt: '2026-05-01' },
      { id: 'h2', articleId: 'a1', text: 'unrelated', note: 'glaciers footnote', createdAt: '2026-05-01' },
      { id: 'h3', articleId: 'a1', text: 'totally separate', createdAt: '2026-05-01' },
    ];
    const results = searchHighlights('glaciers', highlights, articles);
    expect(results.map((r) => r.highlight.id)).toEqual(['h1', 'h2']);
    expect(results[0]!.article?.id).toBe('a1');
  });
});

describe('makeSnippet', () => {
  test('clips around the match with ellipses', () => {
    const text = `${'a'.repeat(200)} target ${'b'.repeat(200)}`;
    const snippet = makeSnippet(text, 'target');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('target');
  });

  test('returns the head when query is missing', () => {
    expect(makeSnippet('short text', 'missing')).toBe('short text');
  });
});
