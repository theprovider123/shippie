import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { startTracking } from './event-source.ts';
import { _resetIntelligenceDbForTest, listPageViews } from './storage.ts';

const DEBOUNCE_MS = 250;
const FLUSH_WAIT_MS = DEBOUNCE_MS + 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let win: Window;

beforeEach(async () => {
  await _resetIntelligenceDbForTest();
  win = new Window({ url: 'https://shippie.app/apps/zen' });
});

afterEach(async () => {
  await _resetIntelligenceDbForTest();
});

describe('intelligence/event-source', () => {
  test('persists shippie:pageview events to storage after debounce', async () => {
    const stop = startTracking({ window: win as unknown as globalThis.Window });
    try {
      win.dispatchEvent(
        new win.CustomEvent('shippie:pageview', {
          detail: { path: '/recipes', excerpt: 'pasta night' },
        }),
      );

      // Before debounce fires, nothing should be persisted yet.
      const before = await listPageViews({});
      expect(before).toHaveLength(0);

      await sleep(FLUSH_WAIT_MS);

      const after = await listPageViews({});
      expect(after).toHaveLength(1);
      expect(after[0]?.path).toBe('/recipes');
      expect(after[0]?.excerpt).toBe('pasta night');
      expect(typeof after[0]?.ts).toBe('number');
    } finally {
      stop();
    }
  });

  test('batches a flurry of pageviews into a single debounced flush', async () => {
    const stop = startTracking({ window: win as unknown as globalThis.Window });
    try {
      for (let i = 0; i < 5; i += 1) {
        win.dispatchEvent(
          new win.CustomEvent('shippie:pageview', {
            detail: { path: `/p/${i}` },
          }),
        );
      }
      await sleep(FLUSH_WAIT_MS);
      const all = await listPageViews({});
      expect(all).toHaveLength(5);
      expect(all.map((v) => v.path)).toEqual(['/p/0', '/p/1', '/p/2', '/p/3', '/p/4']);
    } finally {
      stop();
    }
  });

  test('persists shippie:interaction events to the interactions store', async () => {
    const stop = startTracking({ window: win as unknown as globalThis.Window });
    try {
      win.dispatchEvent(
        new win.CustomEvent('shippie:interaction', {
          detail: { target: 'button#new-recipe', kind: 'click' },
        }),
      );
      win.dispatchEvent(
        new win.CustomEvent('shippie:interaction', {
          detail: { target: 'form#login', kind: 'submit' },
        }),
      );

      await sleep(FLUSH_WAIT_MS);

      // Read the interactions store directly — no public lister yet.
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
        expect(all).toHaveLength(2);
        const kinds = (all as Array<{ kind: string; target: string }>).map((e) => e.kind);
        expect(kinds).toEqual(['click', 'submit']);
        const targets = (all as Array<{ target: string }>).map((e) => e.target);
        expect(targets).toEqual(['button#new-recipe', 'form#login']);
      } finally {
        db.close();
      }
    } finally {
      stop();
    }
  });

  test('ignores events with malformed detail shape', async () => {
    const stop = startTracking({ window: win as unknown as globalThis.Window });
    try {
      // Missing `path`.
      win.dispatchEvent(
        new win.CustomEvent('shippie:pageview', { detail: { excerpt: 'no path' } }),
      );
      // Wrong kind value.
      win.dispatchEvent(
        new win.CustomEvent('shippie:interaction', {
          detail: { target: 'div', kind: 'mouseover' },
        }),
      );
      // detail = null
      win.dispatchEvent(new win.CustomEvent('shippie:pageview', { detail: null }));

      await sleep(FLUSH_WAIT_MS);
      const views = await listPageViews({});
      expect(views).toHaveLength(0);
    } finally {
      stop();
    }
  });

  test('stop() detaches listeners — events after stop are not persisted', async () => {
    const stop = startTracking({ window: win as unknown as globalThis.Window });
    win.dispatchEvent(
      new win.CustomEvent('shippie:pageview', { detail: { path: '/before' } }),
    );
    await sleep(FLUSH_WAIT_MS);
    let views = await listPageViews({});
    expect(views).toHaveLength(1);

    stop();
    win.dispatchEvent(
      new win.CustomEvent('shippie:pageview', { detail: { path: '/after' } }),
    );
    await sleep(FLUSH_WAIT_MS);
    views = await listPageViews({});
    expect(views).toHaveLength(1);
    expect(views[0]?.path).toBe('/before');
  });
});
