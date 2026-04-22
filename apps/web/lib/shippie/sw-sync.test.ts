import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
// fake-indexeddb injects an IDB impl onto globalThis
import 'fake-indexeddb/auto';
import { enqueueBeacon, flushBeaconQueue } from './sw-sync.ts';

const originalFetch = globalThis.fetch;

beforeEach(async () => {
  // Clear the database between tests by deleting + reopening.
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('shippie-beacon-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('enqueueBeacon', () => {
  test('stores a beacon in IndexedDB', async () => {
    await enqueueBeacon('/__shippie/install', JSON.stringify({ event: 'iab_detected' }));
    // The queue should have one row — flushing with a mock fetch proves it.
    const captured: string[] = [];
    globalThis.fetch = (async (url) => {
      captured.push(String(url));
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;
    await flushBeaconQueue();
    expect(captured).toEqual(['/__shippie/install']);
  });

  test('multiple enqueues accumulate', async () => {
    await enqueueBeacon('/__shippie/install', '{"event":"a"}');
    await enqueueBeacon('/__shippie/install', '{"event":"b"}');
    const bodies: string[] = [];
    globalThis.fetch = (async (_url, init) => {
      bodies.push(String(init?.body ?? ''));
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;
    await flushBeaconQueue();
    expect(bodies.sort()).toEqual(['{"event":"a"}', '{"event":"b"}']);
  });
});

describe('flushBeaconQueue', () => {
  test('is a no-op when the queue is empty', async () => {
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;
    await flushBeaconQueue();
    expect(called).toBe(0);
  });

  test('keeps failed (5xx) entries for retry', async () => {
    await enqueueBeacon('/__shippie/install', '{}');
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      return new Response(null, { status: call === 1 ? 503 : 204 });
    }) as typeof globalThis.fetch;
    // First flush → 503 → keep.
    await flushBeaconQueue();
    // Second flush → 204 → drain.
    await flushBeaconQueue();
    // Third flush should be a no-op (call should stay at 2).
    await flushBeaconQueue();
    expect(call).toBe(2);
  });

  test('drops entries on client errors (4xx except 429)', async () => {
    await enqueueBeacon('/__shippie/install', '{}');
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      return new Response(null, { status: 400 });
    }) as typeof globalThis.fetch;
    // First flush → 400 → drop.
    await flushBeaconQueue();
    // Second flush → empty queue → no more calls.
    await flushBeaconQueue();
    expect(call).toBe(1);
  });

  test('retries on 429 rate-limited', async () => {
    await enqueueBeacon('/__shippie/install', '{}');
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      return new Response(null, { status: call === 1 ? 429 : 204 });
    }) as typeof globalThis.fetch;
    await flushBeaconQueue();
    await flushBeaconQueue();
    expect(call).toBe(2);
  });
});
