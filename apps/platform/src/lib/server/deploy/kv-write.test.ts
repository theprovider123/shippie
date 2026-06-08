import { describe, expect, test } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { writeSuspension, clearSuspension, readSuspension } from './kv-write';

function fakeKv(data: Record<string, string> = {}): KVNamespace {
  return {
    get: (k: string) => Promise.resolve(data[k] ?? null),
    put: async (k: string, v: string) => {
      data[k] = v;
    },
    delete: async (k: string) => {
      delete data[k];
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null })
  } as unknown as KVNamespace;
}

describe('suspension KV helpers', () => {
  test('write → read returns suspended with reason', async () => {
    const kv = fakeKv();
    await writeSuspension(kv, 'bad', 'spam');
    expect(await readSuspension(kv, 'bad')).toEqual({ suspended: true, reason: 'spam' });
  });

  test('absent key → not suspended', async () => {
    expect(await readSuspension(fakeKv(), 'clean')).toEqual({ suspended: false, reason: null });
  });

  test('clear removes the flag', async () => {
    const data: Record<string, string> = {};
    const kv = fakeKv(data);
    await writeSuspension(kv, 'x', 'dmca');
    await clearSuspension(kv, 'x');
    expect(await readSuspension(kv, 'x')).toEqual({ suspended: false, reason: null });
  });

  test('empty/garbage value still counts as suspended (fail-closed)', async () => {
    const kv = fakeKv({ 'apps:y:suspended': '' });
    expect((await readSuspension(kv, 'y')).suspended).toBe(true);
  });
});
