import { describe, expect, test } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { loadSuspension, bustSuspensionCache } from './platform-client';

function fakeKv(data: Record<string, string>): KVNamespace {
  return {
    get: (k: string) => Promise.resolve(data[k] ?? null),
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null })
  } as unknown as KVNamespace;
}

describe('loadSuspension', () => {
  test('reads the dedicated suspended key', async () => {
    bustSuspensionCache('bad');
    const m = await loadSuspension(fakeKv({ 'apps:bad:suspended': 'spam' }), 'bad');
    expect(m).toEqual({ suspended: true, reason: 'spam' });
  });

  test('absent → not suspended', async () => {
    bustSuspensionCache('ok');
    expect(await loadSuspension(fakeKv({}), 'ok')).toEqual({ suspended: false, reason: null });
  });

  test('empty value → suspended (fail-closed)', async () => {
    bustSuspensionCache('y');
    expect((await loadSuspension(fakeKv({ 'apps:y:suspended': '' }), 'y')).suspended).toBe(true);
  });
});
