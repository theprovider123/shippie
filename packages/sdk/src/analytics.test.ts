import { afterEach, describe, expect, test } from 'bun:test';
import { flush, track } from './analytics.ts';

const RETRY_STORAGE_KEY = 'shippie:analytics:retry:v1';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
  return store;
}

afterEach(() => {
  delete (globalThis as any).fetch;
  delete (globalThis as any).localStorage;
});

describe('analytics retry queue', () => {
  test('keeps failed batches for a later flush', async () => {
    const store = installMemoryLocalStorage();
    (globalThis as any).fetch = async () => {
      throw new Error('offline');
    };

    await track('recipe_saved', { source: 'test' });
    await flush();

    const queued = JSON.parse(store.get(RETRY_STORAGE_KEY) ?? '[]') as Array<{ event: string }>;
    expect(queued.map((e) => e.event)).toContain('recipe_saved');
  });

  test('replays and clears queued events when posting succeeds', async () => {
    const store = installMemoryLocalStorage();
    store.set(
      RETRY_STORAGE_KEY,
      JSON.stringify([{ event: 'queued_event', props: { source: 'test' }, ts: Date.now() }]),
    );
    const requests: unknown[] = [];
    (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return Response.json({ ingested: 1 });
    };

    await flush();

    expect(requests).toHaveLength(1);
    expect((requests[0] as { events: Array<{ event: string }> }).events[0]!.event).toBe(
      'queued_event',
    );
    expect(store.get(RETRY_STORAGE_KEY)).toBeUndefined();
  });
});
