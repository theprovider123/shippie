import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import {
  _preloadUrlForTest,
  enablePredictivePreload,
  predictNextPage,
} from './predictive-preload.ts';
import type { PatternsRollup } from './types.ts';

function makeRollup(frequentPaths: string[][]): PatternsRollup {
  return {
    recentViews: 0,
    typicalSessions: [],
    frequentPaths,
    preferences: {
      mostVisitedPath: null,
      averageSessionDurationMs: 0,
      peakUsageHour: null,
    },
  };
}

function stubPatterns(rollup: PatternsRollup): () => Promise<PatternsRollup> {
  return () => Promise.resolve(rollup);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('intelligence/predictive-preload — predictNextPage', () => {
  test('returns the most-frequent next-after-current path', async () => {
    const rollup = makeRollup([
      // /a -> /b appears in two sequences.
      ['/a', '/b', '/c'],
      ['/x', '/a', '/b'],
      // /a -> /c appears in one.
      ['/a', '/c', '/d'],
    ]);
    const result = await predictNextPage('/a', { patternsFn: stubPatterns(rollup) });
    expect(result).not.toBeNull();
    expect(result?.url).toBe('/b');
    // /b: 2 occurrences, /c: 1 occurrence -> 2/3 confidence.
    expect(result?.confidence).toBe(2 / 3);
  });

  test('ties resolve to first encountered candidate', async () => {
    const rollup = makeRollup([
      // /a -> /first appears once before /a -> /second.
      ['/a', '/first', '/x'],
      ['/a', '/second', '/y'],
    ]);
    const result = await predictNextPage('/a', { patternsFn: stubPatterns(rollup) });
    expect(result?.url).toBe('/first');
    expect(result?.confidence).toBe(0.5);
  });

  test('empty patterns -> null', async () => {
    const rollup = makeRollup([]);
    const result = await predictNextPage('/a', { patternsFn: stubPatterns(rollup) });
    expect(result).toBeNull();
  });

  test('current path is the last entry in every sequence -> null', async () => {
    const rollup = makeRollup([
      ['/x', '/y', '/a'],
      ['/m', '/n', '/a'],
    ]);
    const result = await predictNextPage('/a', { patternsFn: stubPatterns(rollup) });
    expect(result).toBeNull();
  });

  test('current path absent from every sequence -> null', async () => {
    const rollup = makeRollup([
      ['/x', '/y', '/z'],
      ['/m', '/n', '/o'],
    ]);
    const result = await predictNextPage('/missing', {
      patternsFn: stubPatterns(rollup),
    });
    expect(result).toBeNull();
  });
});

describe('intelligence/predictive-preload — enablePredictivePreload', () => {
  let win: Window;

  beforeEach(() => {
    win = new Window({ url: 'https://shippie.app/a' });
  });

  afterEach(() => {
    // happy-dom Window cleanup — close releases timers/listeners.
    win.close();
  });

  function getPrefetchLinks(doc: Document, url?: string): Element[] {
    const selector = url
      ? `link[rel="prefetch"][href="${url}"]`
      : 'link[rel="prefetch"]';
    return Array.from(doc.querySelectorAll(selector));
  }

  test('appends a prefetch link when confidence >= threshold', async () => {
    const rollup = makeRollup([
      ['/a', '/b', '/c'],
      ['/x', '/a', '/b'],
      ['/y', '/a', '/b'],
    ]);
    const stop = enablePredictivePreload({
      confidenceThreshold: 0.5,
      window: win as unknown as globalThis.Window,
      document: win.document as unknown as globalThis.Document,
      patternsFn: stubPatterns(rollup),
    });
    try {
      // Allow the run-on-attach microtask chain to resolve.
      await sleep(10);
      const links = getPrefetchLinks(
        win.document as unknown as Document,
        '/b',
      );
      expect(links).toHaveLength(1);
    } finally {
      stop();
    }
  });

  test("doesn't re-add a duplicate prefetch link on repeated pageviews", async () => {
    const rollup = makeRollup([
      ['/a', '/b', '/c'],
      ['/x', '/a', '/b'],
    ]);
    const stop = enablePredictivePreload({
      confidenceThreshold: 0.5,
      window: win as unknown as globalThis.Window,
      document: win.document as unknown as globalThis.Document,
      patternsFn: stubPatterns(rollup),
    });
    try {
      await sleep(10);
      // Fire two more pageview events to re-trigger the handler.
      win.dispatchEvent(new win.CustomEvent('shippie:pageview', { detail: { path: '/a' } }));
      await sleep(10);
      win.dispatchEvent(new win.CustomEvent('shippie:pageview', { detail: { path: '/a' } }));
      await sleep(10);
      const links = getPrefetchLinks(
        win.document as unknown as Document,
        '/b',
      );
      expect(links).toHaveLength(1);
    } finally {
      stop();
    }
  });

  test('below threshold -> no link added', async () => {
    const rollup = makeRollup([
      // /a -> /b once, /a -> /c once, /a -> /d once -> best confidence is 1/3.
      ['/a', '/b'],
      ['/a', '/c'],
      ['/a', '/d'],
    ]);
    const stop = enablePredictivePreload({
      confidenceThreshold: 0.7,
      window: win as unknown as globalThis.Window,
      document: win.document as unknown as globalThis.Document,
      patternsFn: stubPatterns(rollup),
    });
    try {
      await sleep(10);
      const links = getPrefetchLinks(win.document as unknown as Document);
      expect(links).toHaveLength(0);
    } finally {
      stop();
    }
  });

  test('teardown removes the pageview listener', async () => {
    const rollup = makeRollup([
      ['/a', '/b', '/c'],
      ['/x', '/a', '/b'],
    ]);
    const stop = enablePredictivePreload({
      confidenceThreshold: 0.5,
      window: win as unknown as globalThis.Window,
      document: win.document as unknown as globalThis.Document,
      patternsFn: stubPatterns(rollup),
    });
    // Wait for the initial-attach run to complete and for any link it adds.
    await sleep(10);
    // Remove the link inserted by the initial run, then teardown.
    const doc = win.document as unknown as Document;
    for (const el of getPrefetchLinks(doc)) el.remove();
    stop();
    // After teardown, dispatching pageview should not re-add the link.
    win.dispatchEvent(new win.CustomEvent('shippie:pageview', { detail: { path: '/a' } }));
    await sleep(20);
    expect(getPrefetchLinks(doc)).toHaveLength(0);
  });
});

describe('intelligence/predictive-preload — _preloadUrlForTest', () => {
  let win: Window;

  beforeEach(() => {
    win = new Window({ url: 'https://shippie.app/a' });
  });

  afterEach(() => {
    win.close();
  });

  test('inserts a prefetch link at the head', () => {
    const doc = win.document as unknown as Document;
    _preloadUrlForTest('/next', doc);
    const link = doc.querySelector('link[rel="prefetch"][href="/next"]');
    expect(link).not.toBeNull();
  });

  test('skips when a duplicate prefetch link already exists', () => {
    const doc = win.document as unknown as Document;
    _preloadUrlForTest('/next', doc);
    _preloadUrlForTest('/next', doc);
    const links = doc.querySelectorAll('link[rel="prefetch"][href="/next"]');
    expect(links).toHaveLength(1);
  });
});
