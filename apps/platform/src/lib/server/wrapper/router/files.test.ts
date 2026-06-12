/**
 * R2 lookup, SPA fallback, content-type detection, WASM headers (COOP/COEP).
 * Ported from services/worker/src/router/files.test.ts.
 *
 * The SPA fallback path in `serveFromR2` rewrites HTML through `injectPwaTags`
 * (which uses the Workers-runtime HTMLRewriter global). Vitest runs in Node
 * where HTMLRewriter doesn't exist, so we install a minimal polyfill from
 * the wrapper test helpers.
 */
import { describe, expect, test } from 'vitest';
import type { R2Bucket, KVNamespace } from '@cloudflare/workers-types';
import { installHTMLRewriterPolyfill } from '../__test-helpers__/htmlrewriter-polyfill';

installHTMLRewriterPolyfill();

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

function envWith(
  kv: KVNamespace,
  apps: R2Bucket,
  assets?: { fetch: typeof fetch }
): WrapperEnv {
  return {
    DB: {} as never,
    APPS: apps,
    ASSETS: assets,
    PLATFORM_ASSETS: {} as never,
    CACHE: kv,
    SHIPPIE_ENV: 'test',
    PUBLIC_ORIGIN: 'https://test.invalid',
    INVITE_SECRET: 'test-invite'
  };
}

/**
 * Stand-in for the SvelteKit Workers-Assets binding. Returns 200 for any
 * pathname in `available`, 404 otherwise.
 */
function fakeAssets(available: Set<string>): { fetch: typeof fetch } {
  return {
    fetch: ((input: Request | string, _init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? new URL(input)
          : new URL((input as Request).url);
      if (available.has(url.pathname)) {
        return Promise.resolve(
          new Response('<!doctype html><title>baked</title>', {
            status: 200,
            headers: { 'content-type': 'text/html' }
          })
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }) as typeof fetch
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
    const kvData: Record<string, string> = {
      'apps:spa:active': '1',
      'apps:spa:meta': JSON.stringify({ routing: { mode: 'spa' } })
    };
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

  test('MPA routing: extensionless path resolves /path/index.html before 404', async () => {
    const kvData: Record<string, string> = {
      'apps:mpa:active': '1',
      'apps:mpa:meta': JSON.stringify({ routing: { mode: 'mpa' } })
    };
    const r2: Record<string, Stored> = {
      'apps/mpa/v1/index.html': {
        bytes: new TextEncoder().encode('<html>home</html>'),
        contentType: 'text/html'
      },
      'apps/mpa/v1/about/index.html': {
        bytes: new TextEncoder().encode('<html>about</html>'),
        contentType: 'text/html'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://mpa.shippie.app/about', {
        headers: { host: 'mpa.shippie.app' }
      }),
      env,
      slug: 'mpa',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('about');
  });

  test('MPA routing: unknown navigation does not fall back to root index.html', async () => {
    const kvData: Record<string, string> = {
      'apps:mpa404:active': '1',
      'apps:mpa404:meta': JSON.stringify({ routing: { mode: 'mpa' } })
    };
    const r2: Record<string, Stored> = {
      'apps/mpa404/v1/index.html': {
        bytes: new TextEncoder().encode('<html>home</html>'),
        contentType: 'text/html'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://mpa404.shippie.app/missing', {
        headers: { host: 'mpa404.shippie.app', 'sec-fetch-mode': 'navigate' }
      }),
      env,
      slug: 'mpa404',
      traceId: 't'
    });

    expect(res.status).toBe(404);
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

  test('auto-bridge: KV active null + ASSETS hit → 302 to /run/<slug>', async () => {
    const env = envWith(
      fakeKv({}),
      fakeR2({}),
      fakeAssets(new Set(['/__shippie-run/mevrouw/index.html']))
    );
    const res = await serveFromR2({
      request: new Request('https://mevrouw.shippie.app/some/path?ref=share', {
        headers: { host: 'mevrouw.shippie.app' }
      }),
      env,
      slug: 'mevrouw',
      traceId: 't'
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://shippie.app/run/mevrouw/some/path?ref=share'
    );
    expect(res.headers.get('x-shippie-bridge')).toBe('static');
    expect(res.headers.get('cache-control')).toContain('max-age=300');
  });

  test('auto-bridge: KV active null + ASSETS hit + root path → /<slug>', async () => {
    const env = envWith(
      fakeKv({}),
      fakeR2({}),
      fakeAssets(new Set(['/__shippie-run/mevrouw/index.html']))
    );
    const res = await serveFromR2({
      request: new Request('https://mevrouw.shippie.app/', {
        headers: { host: 'mevrouw.shippie.app' }
      }),
      env,
      slug: 'mevrouw',
      traceId: 't'
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://shippie.app/mevrouw');
  });

  test('auto-bridge: KV active null + ASSETS miss → unpublished page', async () => {
    const env = envWith(fakeKv({}), fakeR2({}), fakeAssets(new Set()));
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

  test('auto-bridge: building flag still wins over static fallback', async () => {
    // Even though the static shell exists, an active deploy in flight should
    // show the shipping… progress page so the maker sees it land.
    const kv = fakeKv({
      'apps:mevrouw:building': JSON.stringify({
        commit_sha: 'feedface',
        started_at: Date.now(),
        source: 'github'
      })
    });
    const env = envWith(
      kv,
      fakeR2({}),
      fakeAssets(new Set(['/__shippie-run/mevrouw/index.html']))
    );
    const res = await serveFromR2({
      request: new Request('https://mevrouw.shippie.app/', {
        headers: { host: 'mevrouw.shippie.app' }
      }),
      env,
      slug: 'mevrouw',
      traceId: 't'
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Shippie-Status')).toBe('building');
    expect(res.headers.get('Refresh')).toBe('5');
  });

  test('HTML documents get share/OG tags injected from KV meta', async () => {
    const kvData: Record<string, string> = {
      'apps:shareme:active': '3',
      'apps:shareme:meta': JSON.stringify({
        name: 'Share Me',
        theme_color: '#1B6B5C',
        routing: { mode: 'spa' }
      })
    };
    const r2: Record<string, Stored> = {
      'apps/shareme/v3/index.html': {
        bytes: new TextEncoder().encode(
          '<!doctype html><html><head><title>app</title></head><body>hi</body></html>'
        ),
        contentType: 'text/html'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://shareme.shippie.app/', {
        headers: { host: 'shareme.shippie.app' }
      }),
      env,
      slug: 'shareme',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="Share Me"');
    expect(html).toContain('<meta property="og:description" content="Share Me on Shippie"');
    expect(html).toContain('<meta property="og:site_name" content="Shippie"');
    expect(html).toContain('<meta property="og:url" content="https://shareme.shippie.app/"');
    expect(html).toContain('/api/apps/shareme/og.png');
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain('<meta name="theme-color" content="#1B6B5C"');
    // Injected tags must land inside <head>, before the app's own content.
    expect(html.indexOf('og:title')).toBeLessThan(html.indexOf('<title>'));
  });

  test('share/OG injection is skipped when the app declares its own og:image', async () => {
    const kvData: Record<string, string> = {
      'apps:owntags:active': '1',
      'apps:owntags:meta': JSON.stringify({ name: 'Own Tags', theme_color: '#123456' })
    };
    const r2: Record<string, Stored> = {
      'apps/owntags/v1/index.html': {
        bytes: new TextEncoder().encode(
          '<!doctype html><html><head><meta property="og:image" content="https://example.com/card.png"><meta name="theme-color" content="#abcdef"></head><body>hi</body></html>'
        ),
        contentType: 'text/html'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://owntags.shippie.app/', {
        headers: { host: 'owntags.shippie.app' }
      }),
      env,
      slug: 'owntags',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('og:title');
    expect(html).not.toContain('data-shippie-share');
    expect(html).toContain('https://example.com/card.png');
    // The app's own theme-color survives untouched.
    expect(html).toContain('#abcdef');
    expect(html).not.toContain('#123456');
  });

  test('non-HTML assets are served byte-identical (no share tags)', async () => {
    const source = 'console.log("untouched")';
    const kvData: Record<string, string> = {
      'apps:rawjs:active': '1',
      'apps:rawjs:meta': JSON.stringify({ name: 'Raw JS', theme_color: '#1B6B5C' })
    };
    const r2: Record<string, Stored> = {
      'apps/rawjs/v1/app.js': {
        bytes: new TextEncoder().encode(source),
        contentType: 'application/javascript'
      }
    };
    const env = envWith(fakeKv(kvData), fakeR2(r2));

    const res = await serveFromR2({
      request: new Request('https://rawjs.shippie.app/app.js', {
        headers: { host: 'rawjs.shippie.app' }
      }),
      env,
      slug: 'rawjs',
      traceId: 't'
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(source);
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
