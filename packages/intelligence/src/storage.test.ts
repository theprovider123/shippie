import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  _peekCachedDbForTest,
  _resetIntelligenceDbForTest,
  appendEmbedding,
  appendInteraction,
  appendPageView,
  getEmbedding,
  listPageViews,
} from './storage.ts';

beforeEach(async () => {
  await _resetIntelligenceDbForTest();
});

afterEach(async () => {
  await _resetIntelligenceDbForTest();
});

describe('intelligence/storage', () => {
  test('appendPageView returns auto-id and round-trips via listPageViews', async () => {
    const id1 = await appendPageView({ path: '/', ts: 100 });
    const id2 = await appendPageView({ path: '/recipes', ts: 200, excerpt: 'hello' });
    const id3 = await appendPageView({ path: '/recipes/1', ts: 300, durationMs: 1500 });

    expect(typeof id1).toBe('number');
    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);

    const all = await listPageViews({});
    expect(all).toHaveLength(3);
    expect(all[0]?.path).toBe('/');
    expect(all[0]?.id).toBe(id1);
    expect(all[1]?.path).toBe('/recipes');
    expect(all[1]?.excerpt).toBe('hello');
    expect(all[2]?.durationMs).toBe(1500);
  });

  test('listPageViews respects since filter (inclusive lower bound on ts)', async () => {
    await appendPageView({ path: '/a', ts: 100 });
    await appendPageView({ path: '/b', ts: 200 });
    await appendPageView({ path: '/c', ts: 300 });
    await appendPageView({ path: '/d', ts: 400 });

    const since200 = await listPageViews({ since: 200 });
    expect(since200).toHaveLength(3);
    expect(since200.map((v) => v.path)).toEqual(['/b', '/c', '/d']);

    const since301 = await listPageViews({ since: 301 });
    expect(since301).toHaveLength(1);
    expect(since301[0]?.path).toBe('/d');

    const sinceFuture = await listPageViews({ since: 999 });
    expect(sinceFuture).toHaveLength(0);
  });

  test('listPageViews respects limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await appendPageView({ path: `/p${i}`, ts: i * 10 });
    }
    const limited = await listPageViews({ limit: 2 });
    expect(limited).toHaveLength(2);
    expect(limited[0]?.path).toBe('/p0');
    expect(limited[1]?.path).toBe('/p1');
  });

  test('listPageViews combines since + limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await appendPageView({ path: `/p${i}`, ts: i * 10 });
    }
    const got = await listPageViews({ since: 20, limit: 2 });
    expect(got).toHaveLength(2);
    expect(got.map((v) => v.path)).toEqual(['/p2', '/p3']);
  });

  test('appendInteraction round-trips via underlying store', async () => {
    // No public lister for interactions yet — verify via no-throw + side effect
    // through the embedding store and a fresh open after a reset roundtrip.
    await appendInteraction({ ts: 1, target: 'button#go', kind: 'click' });
    await appendInteraction({ ts: 2, target: 'a[href="/x"]', kind: 'click' });
    await appendInteraction({ ts: 3, target: 'form#login', kind: 'submit' });

    // Directly inspect the store via a fresh transaction (we use the same DB).
    const idbReq = indexedDB.open('shippie-intelligence');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      idbReq.onsuccess = () => resolve(idbReq.result);
      idbReq.onerror = () => reject(idbReq.error);
    });
    try {
      const all = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction('interactions', 'readonly');
        const req = tx.objectStore('interactions').getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(req.error);
      });
      expect(all).toHaveLength(3);
      const kinds = (all as Array<{ kind: string }>).map((e) => e.kind);
      expect(kinds).toEqual(['click', 'click', 'submit']);
    } finally {
      db.close();
    }
  });

  test('appendEmbedding + getEmbedding round-trip Float32Array', async () => {
    const viewId = await appendPageView({ path: '/r/1', ts: 500 });
    const vec = new Float32Array([0.1, -0.2, 0.3, 0.4, 0.5]);
    await appendEmbedding(viewId, vec);

    const got = await getEmbedding(viewId);
    expect(got).not.toBeNull();
    expect(got instanceof Float32Array).toBe(true);
    expect(got?.length).toBe(5);
    expect(got?.[0]).toBeCloseTo(0.1, 5);
    expect(got?.[1]).toBeCloseTo(-0.2, 5);
    expect(got?.[4]).toBeCloseTo(0.5, 5);
  });

  test('getEmbedding returns null for unknown viewId', async () => {
    const got = await getEmbedding(99999);
    expect(got).toBeNull();
  });

  test('appendEmbedding is idempotent (last write wins)', async () => {
    const viewId = await appendPageView({ path: '/r/2', ts: 600 });
    await appendEmbedding(viewId, new Float32Array([1, 2, 3]));
    await appendEmbedding(viewId, new Float32Array([4, 5, 6]));
    const got = await getEmbedding(viewId);
    expect(got?.length).toBe(3);
    expect(got?.[0]).toBeCloseTo(4, 5);
    expect(got?.[2]).toBeCloseTo(6, 5);
  });

  test('_resetIntelligenceDbForTest closes cached connection and deletes DB', async () => {
    await appendPageView({ path: '/keep-me', ts: 1 });
    expect(_peekCachedDbForTest()).not.toBeNull();

    await _resetIntelligenceDbForTest();
    expect(_peekCachedDbForTest()).toBeNull();

    // Re-open: the previous data should be gone.
    const after = await listPageViews({});
    expect(after).toHaveLength(0);
  });

  // Helper: extends bun:test's expect with toBeCloseTo for Float comparisons.
});

// bun:test ships toBeCloseTo at runtime even though our shim doesn't list it;
// declare it locally so TypeScript is happy.
declare module 'bun:test' {
  interface Matchers<R> {
    toBeCloseTo: (expected: number, precision?: number) => R;
    not: Matchers<R>;
  }
}
