/**
 * reconcile-kv tests. Uses a fetchPage injection (no module mocking) so
 * the test runs cleanly under both vitest and `bun test`.
 */
import { describe, expect, test } from 'vitest';
import type { KVNamespace, D1Database } from '@cloudflare/workers-types';
import { reconcileKv, type ReconcileRow, type FetchPage } from './reconcile-kv';

function fakeKv(seed: Record<string, string> = {}): KVNamespace {
  return {
    get: async (key: string) => seed[key] ?? null,
    put: async (key: string, value: string) => {
      seed[key] = value;
    },
    delete: async (key: string) => {
      delete seed[key];
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

function singlePageFetcher(rows: ReconcileRow[]): FetchPage {
  return async (offset: number) => (offset === 0 ? rows : []);
}

describe('reconcileKv', () => {
  test('rewrites KV when version disagrees', async () => {
    const seed: Record<string, string> = {
      'apps:foo:active': '3',
      'apps:foo:csp': 'old-csp',
    };

    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv(seed),
      },
      singlePageFetcher([{ slug: 'foo', version: 5, cspHeader: 'new-csp' }]),
    );

    expect(seed['apps:foo:active']).toBe('5');
    expect(seed['apps:foo:csp']).toBe('new-csp');
    expect(result.checked).toBe(1);
    expect(result.updated).toEqual(['foo']);
    expect(result.csp_updated).toEqual(['foo']);
  });

  test('no-op when KV already matches', async () => {
    const seed: Record<string, string> = {
      'apps:bar:active': '7',
      'apps:bar:csp': 'csp-x',
    };

    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv(seed),
      },
      singlePageFetcher([{ slug: 'bar', version: 7, cspHeader: 'csp-x' }]),
    );

    expect(result.updated).toEqual([]);
    expect(result.csp_updated).toEqual([]);
  });

  test('flags rows missing version', async () => {
    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv({}),
      },
      singlePageFetcher([{ slug: 'no-deploy', version: null, cspHeader: null }]),
    );

    expect(result.missing_version).toEqual(['no-deploy']);
  });
});
