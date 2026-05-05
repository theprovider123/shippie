import { describe, expect, test, vi } from 'vitest';
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { handle } from './hooks.server';

function fakeKv(): KVNamespace {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({
      value: null,
      metadata: null,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

function emptyR2(): R2Bucket {
  return {
    get: async () => null,
    head: async () => null,
    put: async () => null,
    delete: async () => undefined,
    list: async () => ({
      objects: [],
      truncated: false,
      delimitedPrefixes: [],
    }),
  } as unknown as R2Bucket;
}

function eventFor(url: string) {
  return {
    url: new URL(url),
    request: new Request(url, { headers: { host: new URL(url).host } }),
    platform: {
      env: {
        DB: {} as never,
        APPS: emptyR2(),
        PLATFORM_ASSETS: emptyR2(),
        CACHE: fakeKv(),
        SHIPPIE_ENV: 'test',
        PUBLIC_ORIGIN: 'http://test.invalid',
        INVITE_SECRET: 'test-invite',
      },
    },
    locals: {},
    cookies: {
      get: () => undefined,
      set: () => undefined,
    },
  };
}

describe('hooks.server first-party showcase routing', () => {
  test('first-party showcase subdomains serve __shippie system routes instead of redirecting into /run', async () => {
    const resolve = vi.fn(async () => new Response('fallthrough'));
    const res = await handle({
      event: eventFor('https://recipe.shippie.app/__shippie/health') as never,
      resolve,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
    const body = (await res.json()) as { ok: boolean; slug: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe('recipe-saver');
  });
});
