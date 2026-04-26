/**
 * Integration: maker-subdomain dispatcher returns proper responses for
 * HTML, asset, and /__shippie/* paths. End-to-end test of the
 * hostname → wrapper short-circuit added in Phase 5.
 */
import { describe, expect, test } from 'vitest';
import type { R2Bucket, KVNamespace } from '@cloudflare/workers-types';
import { dispatchMakerSubdomain } from './dispatcher';
import type { WrapperEnv } from './env';

function fakeKv(data: Record<string, string>): KVNamespace {
  return {
    get: (key: string) => Promise.resolve(data[key] ?? null),
    put: async (k: string, v: string) => {
      data[k] = v;
    },
    delete: async (k: string) => {
      delete data[k];
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({
      value: null,
      metadata: null,
      cacheStatus: null
    })
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
      delimitedPrefixes: []
    })
  } as unknown as R2Bucket;
}

function envWith(kv: KVNamespace): WrapperEnv {
  return {
    DB: {} as never,
    APPS: emptyR2(),
    ASSETS: undefined,
    PLATFORM_ASSETS: emptyR2(),
    CACHE: kv,
    SHIPPIE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://test.invalid',
    INVITE_SECRET: 'test-invite'
  };
}

describe('dispatchMakerSubdomain', () => {
  test('platform host (shippie.app) → null (falls through)', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request('https://shippie.app/', {
        headers: { host: 'shippie.app' }
      }),
      env
    });
    expect(res).toBeNull();
  });

  test('unknown maker subdomain with no R2 → 404 unpublished page', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request('https://noapp.shippie.app/', {
        headers: { host: 'noapp.shippie.app' }
      }),
      env
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    expect(await res!.text()).toContain("hasn't shipped yet");
  });

  test('/__shippie/health on maker subdomain → 200 JSON', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request('https://x.shippie.app/__shippie/health', {
        headers: { host: 'x.shippie.app' }
      }),
      env
    });
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { ok: boolean; slug: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe('x');
  });

  test('/__shippie/manifest returns valid JSON manifest', async () => {
    const env = envWith(
      fakeKv({
        'apps:x:meta': JSON.stringify({
          name: 'X App',
          theme_color: '#abcdef'
        })
      })
    );
    const res = await dispatchMakerSubdomain({
      request: new Request('https://x.shippie.app/__shippie/manifest', {
        headers: { host: 'x.shippie.app' }
      }),
      env
    });
    expect(res!.status).toBe(200);
    expect(res!.headers.get('Content-Type')).toContain('manifest+json');
    const body = (await res!.json()) as {
      name: string;
      theme_color: string;
      icons: unknown[];
    };
    expect(body.name).toBe('X App');
    expect(body.theme_color).toBe('#abcdef');
    expect(body.icons).toBeTruthy();
  });

  test('/__shippie/data returns the Your Data panel HTML', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request('https://x.shippie.app/__shippie/data', {
        headers: { host: 'x.shippie.app' }
      }),
      env
    });
    expect(res!.status).toBe(200);
    expect(res!.headers.get('Content-Type')).toContain('text/html');
    const html = await res!.text();
    expect(html).toContain('Your Data');
  });

  test('/__shippie/signal/{room} → 503 (Phase 6)', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request(
        'https://x.shippie.app/__shippie/signal/abc123def456',
        { headers: { host: 'x.shippie.app' } }
      ),
      env
    });
    expect(res!.status).toBe(503);
  });

  test('finalizeResponse echoes trace id', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request('https://x.shippie.app/__shippie/health', {
        headers: { host: 'x.shippie.app', 'x-shippie-trace-id': 'tr-abc-1' }
      }),
      env
    });
    expect(res!.headers.get('x-shippie-trace-id')).toBe('tr-abc-1');
  });
});
