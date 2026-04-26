/**
 * R2 lookup, SPA fallback, content-type detection, WASM headers (COOP/COEP).
 * Ported from services/worker/src/router/files.test.ts.
 */
import { describe, expect, test } from 'vitest';
import type { R2Bucket, KVNamespace } from '@cloudflare/workers-types';
import { serveFromR2 } from './files';
import type { WrapperEnv } from '../env';

interface Stored {
  bytes: Uint8Array;
  contentType: string;
}

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
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null })
  } as unknown as KVNamespace;
}

function fakeR2(store: Record<string, Stored>): R2Bucket {
  return {
    get: async (k: string) => {
      const e = store[k];
      if (!e) return null;
      const buf = e.bytes.buffer.slice(
        e.bytes.byteOffset,
        e.bytes.byteOffset + e.bytes.byteLength
      );
      return {
        key: k,
        size: e.bytes.byteLength,
        httpMetadata: { contentType: e.contentType },
        arrayBuffer: async () => buf,
        text: async () => new TextDecoder().decode(e.bytes),
        json: async () => JSON.parse(new TextDecoder().decode(e.bytes))
      };
    },
    head: async (k: string) => {
      const e = store[k];
      return e
        ? {
            key: k,
            size: e.bytes.byteLength,
            httpMetadata: { contentType: e.contentType }
          }
        : null;
    },
    put: async () => null,
    delete: async () => undefined,
    list: async () => ({
      objects: [],
      truncated: false,
      delimitedPrefixes: []
    })
  } as unknown as R2Bucket;
}

function envWith(kv: KVNamespace, apps: R2Bucket): WrapperEnv {
  return {
    DB: {} as never,
    APPS: apps,
    ASSETS: undefined,
    PLATFORM_ASSETS: {} as never,
    CACHE: kv,
    SHIPPIE_ENV: 'test',
    PUBLIC_ORIGIN: 'https://test.invalid',
    INVITE_SECRET: 'test-invite'
  };
}

describe('serveFromR2 — wasm headers + SPA fallback', () => {
  test('serves .wasm with application/wasm + COEP + COOP', async () => {
    const kvData: Record<string, string> = { 'apps:wasmy:active': '1' };
    const r2: Record<string, Stored> = {
      'apps/wasmy/v1/hello.wasm': {
        bytes: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
        contentType: 'application/octet-stream'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://wasmy.shippie.app/hello.wasm', {
        headers: { host: 'wasmy.shippie.app' }
      }),
      env,
      slug: 'wasmy',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/wasm');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe(
      'require-corp'
    );
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  test('non-wasm assets do not gain COEP/COOP', async () => {
    const kvData: Record<string, string> = { 'apps:js:active': '1' };
    const r2: Record<string, Stored> = {
      'apps/js/v1/app.js': {
        bytes: new TextEncoder().encode('console.log(1)'),
        contentType: 'application/javascript'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://js.shippie.app/app.js', {
        headers: { host: 'js.shippie.app' }
      }),
      env,
      slug: 'js',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/javascript');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
  });

  test('SPA fallback: missing path → index.html', async () => {
    const kvData: Record<string, string> = { 'apps:spa:active': '1' };
    const r2: Record<string, Stored> = {
      'apps/spa/v1/index.html': {
        bytes: new TextEncoder().encode('<html>spa</html>'),
        contentType: 'text/html'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://spa.shippie.app/some/route', {
        headers: { host: 'spa.shippie.app' }
      }),
      env,
      slug: 'spa',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('spa');
  });

  test('no active pointer → unpublished page', async () => {
    const env = envWith(fakeKv({}), fakeR2({}));
    const res = await serveFromR2({
      request: new Request('https://nope.shippie.app/', {
        headers: { host: 'nope.shippie.app' }
      }),
      env,
      slug: 'nope',
      traceId: 't'
    });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain("hasn't shipped yet");
  });

  test('building flag → shipping… page with refresh', async () => {
    const kv = fakeKv({
      'apps:bld:building': JSON.stringify({
        commit_sha: 'abc1234',
        started_at: Date.now(),
        source: 'github'
      })
    });
    const env = envWith(kv, fakeR2({}));
    const res = await serveFromR2({
      request: new Request('https://bld.shippie.app/', {
        headers: { host: 'bld.shippie.app' }
      }),
      env,
      slug: 'bld',
      traceId: 't'
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Shippie-Status')).toBe('building');
    expect(res.headers.get('Refresh')).toBe('5');
  });
});
