import { describe, expect, test } from 'vitest';
import type { KVNamespace, D1Database } from '@cloudflare/workers-types';
import { reconcileKv } from './reconcile-kv';

interface JoinRow {
  slug: string;
  version: number | null;
  cspHeader: string | null;
}

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

/**
 * Minimal stub D1 that returns a single page of rows, then empty.
 *
 * The handler under test wraps D1 with drizzle and runs a select-leftJoin-where
 * chain. We mock at the higher level by intercepting the drizzle method chain
 * via a `getDrizzleClient` proxy. Easier: stub the chain entry directly via
 * module mocking. Vitest's vi.mock would work but adds complexity — for this
 * test we exercise the convergence behaviour with a custom drizzle stub
 * exposed through a shim.
 */

import { vi } from 'vitest';

vi.mock('../db/client', () => {
  const rowsRef: { rows: JoinRow[] } = { rows: [] };
  return {
    schema: {
      apps: { activeDeployId: 'apps.active_deploy_id' },
      deploys: { id: 'deploys.id', version: 'deploys.version', cspHeader: 'deploys.csp_header' },
    },
    getDrizzleClient: () => ({
      __setRows: (rows: JoinRow[]) => {
        rowsRef.rows = rows;
      },
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => ({
                offset: (off: number) => (off === 0 ? Promise.resolve(rowsRef.rows) : Promise.resolve([])),
              }),
            }),
          }),
        }),
      }),
    }),
    rowsRef,
  };
});

import * as clientMod from '../db/client';

describe('reconcileKv', () => {
  test('rewrites KV when version disagrees', async () => {
    const seed: Record<string, string> = {
      'apps:foo:active': '3',
      'apps:foo:csp': 'old-csp',
    };
    // Our stubbed select chain ignores rows; inject via mock module helper.
    (clientMod as unknown as { rowsRef: { rows: JoinRow[] } }).rowsRef.rows = [
      { slug: 'foo', version: 5, cspHeader: 'new-csp' },
    ];

    const result = await reconcileKv({
      DB: {} as unknown as D1Database,
      CACHE: fakeKv(seed),
    });

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
    (clientMod as unknown as { rowsRef: { rows: JoinRow[] } }).rowsRef.rows = [
      { slug: 'bar', version: 7, cspHeader: 'csp-x' },
    ];

    const result = await reconcileKv({
      DB: {} as unknown as D1Database,
      CACHE: fakeKv(seed),
    });

    expect(result.updated).toEqual([]);
    expect(result.csp_updated).toEqual([]);
  });

  test('flags rows missing version', async () => {
    (clientMod as unknown as { rowsRef: { rows: JoinRow[] } }).rowsRef.rows = [
      { slug: 'no-deploy', version: null, cspHeader: null },
    ];

    const result = await reconcileKv({
      DB: {} as unknown as D1Database,
      CACHE: fakeKv({}),
    });

    expect(result.missing_version).toEqual(['no-deploy']);
  });
});
