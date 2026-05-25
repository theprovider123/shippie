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
    expect(html).toContain('Shippie stores sealed copies');
    expect(html).toContain("we can't open");
  });

  test('/__shippie/connections returns connection guard metadata', async () => {
    const env = envWith(
      fakeKv({
        'apps:x:meta': JSON.stringify({
          name: 'X App',
          connection_guard: {
            schema: 'shippie.connection-guard.v1',
            passed: true,
            summary: '1 outbound host disclosed and constrained by Connection Guard.',
            connections: [{ host: 'api.weather.test', destinations: ['connect'], risk: 'medium' }],
          },
        }),
      })
    );
    const res = await dispatchMakerSubdomain({
      request: new Request('https://x.shippie.app/__shippie/connections', {
        headers: { host: 'x.shippie.app' },
      }),
      env,
    });
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      name: string;
      connection_guard: { connections: Array<{ host: string }> };
    };
    expect(body.name).toBe('X App');
    expect(body.connection_guard.connections[0]?.host).toBe('api.weather.test');
  });

  test('/__shippie/connections discloses legacy wrapped URL upstreams', async () => {
    const env = envWith(
      fakeKv({
        'apps:legacy:wrap': JSON.stringify({
          upstream_url: 'https://legacy.example/app',
          csp_mode: 'lenient',
        }),
      })
    );
    const res = await dispatchMakerSubdomain({
      request: new Request('https://legacy.shippie.app/__shippie/connections', {
        headers: { host: 'legacy.shippie.app' },
      }),
      env,
    });
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      connection_guard: { warns: number; connections: Array<{ host: string; risk: string }> };
      allowed_connect_domains: string[];
    };
    expect(body.connection_guard.warns).toBe(1);
    expect(body.connection_guard.connections[0]).toMatchObject({
      host: 'legacy.example',
      risk: 'high',
    });
    expect(body.allowed_connect_domains).toEqual(['legacy.example']);
  });

  test('/__shippie/meta includes wrapped URL connection guard fallback', async () => {
    const env = envWith(
      fakeKv({
        'apps:legacy-meta:wrap': JSON.stringify({
          upstream_url: 'https://legacy-meta.example/app',
          csp_mode: 'strict',
        }),
      })
    );
    const res = await dispatchMakerSubdomain({
      request: new Request('https://legacy-meta.shippie.app/__shippie/meta', {
        headers: { host: 'legacy-meta.shippie.app' },
      }),
      env,
    });
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      connection_guard: { connections: Array<{ host: string }> };
      allowed_connect_domains: string[];
    };
    expect(body.connection_guard.connections[0]?.host).toBe('legacy-meta.example');
    expect(body.allowed_connect_domains).toEqual(['legacy-meta.example']);
  });

  test('/__shippie/signal/{room} without binding → 503', async () => {
    const env = envWith(fakeKv({}));
    const res = await dispatchMakerSubdomain({
      request: new Request(
        'https://x.shippie.app/__shippie/signal/abc123def456',
        { headers: { host: 'x.shippie.app', Upgrade: 'websocket' } }
      ),
      env
    });
    expect(res!.status).toBe(503);
  });

  test('/__shippie/signal/{room} forwards websocket upgrades to SignalRoom', async () => {
    const env = envWith(fakeKv({}));
    let roomName = '';
    let forwarded = false;
    env.SIGNAL_ROOM = {
      idFromName(name: string) {
        roomName = name;
        return { toString: () => `room:${name}` };
      },
      get() {
        return {
          fetch: async () => {
            forwarded = true;
            return new Response('forwarded', { status: 200 });
          }
        } as never;
      }
    } as never;

    const res = await dispatchMakerSubdomain({
      request: new Request(
        'https://x.shippie.app/__shippie/signal/abc123def456',
        { headers: { host: 'x.shippie.app', Upgrade: 'websocket' } }
      ),
      env
    });

    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe('forwarded');
    expect(roomName).toBe('abc123def456');
    expect(forwarded).toBe(true);
  });

  test('/__shippie/checkpoints/{room} stores, returns, and deletes sealed checkpoints', async () => {
    const env = envWith(fakeKv({}));
    const put = await dispatchMakerSubdomain({
      request: new Request('https://mevrouw.shippie.app/__shippie/checkpoints/mevrouw-room', {
        method: 'PUT',
        headers: { host: 'mevrouw.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'shippie.sealed-checkpoint.v1',
          update_bytes: 128,
          payload: 'abc123_--',
        }),
      }),
      env,
    });
    expect(put!.status).toBe(200);

    const get = await dispatchMakerSubdomain({
      request: new Request('https://mevrouw.shippie.app/__shippie/checkpoints/mevrouw-room', {
        headers: { host: 'mevrouw.shippie.app' },
      }),
      env,
    });
    expect(get!.status).toBe(200);
    const body = (await get!.json()) as {
      exists: boolean;
      update_bytes: number;
      payload: string;
    };
    expect(body.exists).toBe(true);
    expect(body.update_bytes).toBe(128);
    expect(body.payload).toBe('abc123_--');

    const del = await dispatchMakerSubdomain({
      request: new Request('https://mevrouw.shippie.app/__shippie/checkpoints/mevrouw-room', {
        method: 'DELETE',
        headers: { host: 'mevrouw.shippie.app' },
      }),
      env,
    });
    expect(del!.status).toBe(200);

    const missing = await dispatchMakerSubdomain({
      request: new Request('https://mevrouw.shippie.app/__shippie/checkpoints/mevrouw-room', {
        headers: { host: 'mevrouw.shippie.app' },
      }),
      env,
    });
    expect(((await missing!.json()) as { exists: boolean }).exists).toBe(false);
  });

  test('/__shippie/checkpoints/{room} rejects smaller replacement snapshots', async () => {
    const env = envWith(fakeKv({}));
    const url = 'https://mevrouw.shippie.app/__shippie/checkpoints/mevrouw-room';
    const first = await dispatchMakerSubdomain({
      request: new Request(url, {
        method: 'PUT',
        headers: { host: 'mevrouw.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'shippie.sealed-checkpoint.v1',
          update_bytes: 256,
          payload: 'large',
        }),
      }),
      env,
    });
    expect(first!.status).toBe(200);

    const smaller = await dispatchMakerSubdomain({
      request: new Request(url, {
        method: 'PUT',
        headers: { host: 'mevrouw.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'shippie.sealed-checkpoint.v1',
          update_bytes: 8,
          payload: 'small',
        }),
      }),
      env,
    });
    expect(smaller!.status).toBe(409);
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
