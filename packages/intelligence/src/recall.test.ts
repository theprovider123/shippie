import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { cosine, indexPageView, recall, type EmbedFn } from './recall.ts';
import {
  _resetIntelligenceDbForTest,
  appendEmbedding,
  appendPageView,
} from './storage.ts';

beforeEach(async () => {
  await _resetIntelligenceDbForTest();
});

afterEach(async () => {
  await _resetIntelligenceDbForTest();
});

/**
 * Build a deterministic embed function from a fixture map. Unknown text falls
 * back to a low-magnitude near-zero vector so it doesn't accidentally rank
 * high.
 */
function fixtureEmbed(map: Record<string, number[]>, fallback?: number[]): EmbedFn {
  return async (text: string) => {
    const embedding = map[text] ?? fallback ?? [0.001, 0.001, 0.001];
    return { embedding, source: 'fixture' };
  };
}

describe('intelligence/recall', () => {
  describe('cosine', () => {
    test('returns 1 for identical vectors', () => {
      expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    });

    test('returns -1 for opposite vectors', () => {
      expect(cosine([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
    });

    test('returns 0 for orthogonal vectors', () => {
      expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
    });

    test('returns 0 when either vector is all zeros', () => {
      expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(cosine([1, 2, 3], [0, 0, 0])).toBe(0);
    });

    test('handles Float32Array operands (the storage payload type)', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(cosine(a, b)).toBeCloseTo(1, 6);
    });
  });

  describe('recall()', () => {
    test('returns hits ordered by cosine similarity (descending)', async () => {
      // Three views, each with a distinct embedding. Query embedding is closest
      // to the "pasta" view, then "salad", then "running".
      const pastaId = await appendPageView({
        path: '/recipes/pasta',
        ts: 1000,
        excerpt: 'spaghetti carbonara',
      });
      const saladId = await appendPageView({
        path: '/recipes/salad',
        ts: 2000,
        excerpt: 'caesar salad',
      });
      const runningId = await appendPageView({
        path: '/journal/run',
        ts: 3000,
        excerpt: '5k run',
      });

      // Vectors chosen so cosine(query, pasta) > cosine(query, salad) > cosine(query, running).
      await appendEmbedding(pastaId, new Float32Array([1, 0, 0]));
      await appendEmbedding(saladId, new Float32Array([0.7, 0.7, 0]));
      await appendEmbedding(runningId, new Float32Array([0, 0, 1]));

      const embed = fixtureEmbed({ pasta: [1, 0, 0] });

      const hits = await recall({ query: 'pasta', timeframe: { sinceMs: 0 }, embed });

      expect(hits).toHaveLength(3);
      expect(hits[0]?.path).toBe('/recipes/pasta');
      expect(hits[1]?.path).toBe('/recipes/salad');
      expect(hits[2]?.path).toBe('/journal/run');
      expect(hits[0]?.relevance).toBeGreaterThan(hits[1]?.relevance ?? -Infinity);
      expect(hits[1]?.relevance).toBeGreaterThan(hits[2]?.relevance ?? -Infinity);
      expect(hits[0]?.excerpt).toBe('spaghetti carbonara');
      expect(hits[0]?.viewedAt).toBe(1000);
    });

    test('limit caps the number of hits returned (default 5, override honoured)', async () => {
      // Seed 8 views, each with the same embedding so they all match equally.
      for (let i = 0; i < 8; i += 1) {
        const id = await appendPageView({ path: `/p${i}`, ts: 100 + i });
        await appendEmbedding(id, new Float32Array([1, 0, 0]));
      }
      const embed = fixtureEmbed({ q: [1, 0, 0] });

      const defaultHits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed });
      expect(defaultHits).toHaveLength(5);

      const cappedHits = await recall({
        query: 'q',
        timeframe: { sinceMs: 0 },
        limit: 2,
        embed,
      });
      expect(cappedHits).toHaveLength(2);
    });

    test('timeframe.sinceMs filters out older views', async () => {
      const oldId = await appendPageView({ path: '/old', ts: 100 });
      const newId = await appendPageView({ path: '/new', ts: 5000 });
      await appendEmbedding(oldId, new Float32Array([1, 0, 0]));
      await appendEmbedding(newId, new Float32Array([1, 0, 0]));

      const embed = fixtureEmbed({ q: [1, 0, 0] });

      const hits = await recall({ query: 'q', timeframe: { sinceMs: 1000 }, embed });
      expect(hits).toHaveLength(1);
      expect(hits[0]?.path).toBe('/new');
    });

    test('views without embeddings are skipped', async () => {
      const withVecId = await appendPageView({ path: '/has-vec', ts: 1000 });
      await appendPageView({ path: '/no-vec', ts: 2000 });
      await appendEmbedding(withVecId, new Float32Array([1, 0, 0]));

      const embed = fixtureEmbed({ q: [1, 0, 0] });

      const hits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed });
      expect(hits).toHaveLength(1);
      expect(hits[0]?.path).toBe('/has-vec');
    });

    test('empty storage returns empty array', async () => {
      const embed = fixtureEmbed({ q: [1, 0, 0] });
      const hits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed });
      expect(hits).toEqual([]);
    });

    test('durationMs falls through to the hit (and defaults to 0 when missing)', async () => {
      const a = await appendPageView({ path: '/a', ts: 1000, durationMs: 7777 });
      const b = await appendPageView({ path: '/b', ts: 2000 });
      await appendEmbedding(a, new Float32Array([1, 0, 0]));
      await appendEmbedding(b, new Float32Array([1, 0, 0]));

      const embed = fixtureEmbed({ q: [1, 0, 0] });
      const hits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed });
      const aHit = hits.find((h) => h.path === '/a');
      const bHit = hits.find((h) => h.path === '/b');
      expect(aHit?.durationMs).toBe(7777);
      expect(bHit?.durationMs).toBe(0);
    });
  });

  describe('indexPageView()', () => {
    test('embeds text and stores the resulting vector for the view', async () => {
      const viewId = await appendPageView({ path: '/recipes/pasta', ts: 1000 });
      const embed = fixtureEmbed({ 'spaghetti carbonara': [1, 2, 3] });

      await indexPageView(viewId, 'spaghetti carbonara', embed);

      // Verify by recalling with a perfectly-aligned query.
      const queryEmbed = fixtureEmbed({ q: [1, 2, 3] });
      const hits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed: queryEmbed });
      expect(hits).toHaveLength(1);
      expect(hits[0]?.path).toBe('/recipes/pasta');
      expect(hits[0]?.relevance).toBeCloseTo(1, 6);
    });

    test('swallows embed failures (no embedding stored, view absent from recall)', async () => {
      const viewId = await appendPageView({ path: '/oops', ts: 1000 });
      const failingEmbed: EmbedFn = async () => {
        throw new Error('embed failed');
      };

      // Should not throw.
      await indexPageView(viewId, 'whatever', failingEmbed);

      const queryEmbed = fixtureEmbed({ q: [1, 0, 0] });
      const hits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed: queryEmbed });
      expect(hits).toHaveLength(0);
    });

    test('skips writes when the embed function returns an empty embedding', async () => {
      const viewId = await appendPageView({ path: '/empty', ts: 1000 });
      const emptyEmbed: EmbedFn = async () => ({ embedding: [], source: 'fixture' });

      await indexPageView(viewId, 'whatever', emptyEmbed);

      const queryEmbed = fixtureEmbed({ q: [1, 0, 0] });
      const hits = await recall({ query: 'q', timeframe: { sinceMs: 0 }, embed: queryEmbed });
      expect(hits).toHaveLength(0);
    });
  });
});

// bun:test ships toBeCloseTo at runtime even though our shim doesn't list it;
// declare it locally so TypeScript is happy.
declare module 'bun:test' {
  interface Matchers<R> {
    toBeCloseTo: (expected: number, precision?: number) => R;
    not: Matchers<R>;
  }
}
