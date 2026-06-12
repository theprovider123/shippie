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

function row(partial: Partial<ReconcileRow> & { slug: string }): ReconcileRow {
  return {
    version: 1,
    cspHeader: null,
    visibilityScope: 'public',
    organizationId: null,
    ...partial,
  };
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
      singlePageFetcher([row({ slug: 'foo', version: 5, cspHeader: 'new-csp' })]),
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
      singlePageFetcher([row({ slug: 'bar', version: 7, cspHeader: 'csp-x' })]),
    );

    expect(result.updated).toEqual([]);
    expect(result.csp_updated).toEqual([]);
    expect(result.meta_updated).toEqual([]);
  });

  test('flags rows missing version', async () => {
    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv({}),
      },
      singlePageFetcher([row({ slug: 'no-deploy', version: null })]),
    );

    expect(result.missing_version).toEqual(['no-deploy']);
  });

  test('repairs stale visibility_scope in the meta blob', async () => {
    const seed: Record<string, string> = {
      'apps:foo:active': '5',
      'apps:foo:meta': JSON.stringify({
        slug: 'foo',
        name: 'Foo',
        version: 5,
        visibility_scope: 'private',
      }),
    };

    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv(seed),
      },
      singlePageFetcher([row({ slug: 'foo', version: 5, visibilityScope: 'public' })]),
    );

    const meta = JSON.parse(seed['apps:foo:meta']!) as Record<string, unknown>;
    expect(meta.visibility_scope).toBe('public');
    // Untouched fields survive the patch.
    expect(meta.name).toBe('Foo');
    expect(meta.version).toBe(5);
    expect(result.meta_updated).toEqual(['foo']);
  });

  test('repairs stale organization_id and leaves converged meta alone', async () => {
    const seed: Record<string, string> = {
      'apps:team-app:active': '2',
      'apps:team-app:meta': JSON.stringify({
        slug: 'team-app',
        visibility_scope: 'team',
        organization_id: 'org-old',
      }),
      'apps:ok:active': '1',
      'apps:ok:meta': JSON.stringify({ slug: 'ok', visibility_scope: 'public' }),
    };

    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv(seed),
      },
      singlePageFetcher([
        row({ slug: 'team-app', version: 2, visibilityScope: 'team', organizationId: 'org-new' }),
        row({ slug: 'ok', version: 1, visibilityScope: 'public' }),
      ]),
    );

    const meta = JSON.parse(seed['apps:team-app:meta']!) as Record<string, unknown>;
    expect(meta.organization_id).toBe('org-new');
    expect(result.meta_updated).toEqual(['team-app']);
  });

  test('skips meta repair when no blob exists (app never deployed its meta)', async () => {
    const seed: Record<string, string> = { 'apps:fresh:active': '1' };

    const result = await reconcileKv(
      {
        DB: {} as unknown as D1Database,
        CACHE: fakeKv(seed),
      },
      singlePageFetcher([row({ slug: 'fresh', version: 1, visibilityScope: 'public' })]),
    );

    expect(seed['apps:fresh:meta']).toBeUndefined();
    expect(result.meta_updated).toEqual([]);
  });
});
