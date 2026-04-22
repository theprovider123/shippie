import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string>): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => { data[k] = v; },
    putJson: async (k, v) => { data[k] = JSON.stringify(v); },
    delete: async (k) => { delete data[k]; },
    list: async (p) => Object.keys(data).filter((k) => !p || k.startsWith(p)),
  };
}
function emptyR2(): R2Store {
  return {
    get: async () => null, head: async () => null,
    put: async () => {}, delete: async () => {}, list: async () => [],
  };
}

describe('POST /__shippie/beacon', () => {
  const app = createApp();
  let env: WorkerEnv;
  const capturedRequests: { url: string; body: string }[] = [];

  beforeEach(() => {
    capturedRequests.length = 0;
    env = {
      SHIPPIE_ENV: 'test',
      PLATFORM_API_URL: 'https://platform.test',
      WORKER_PLATFORM_SECRET: 'test-secret',
      APP_CONFIG: fakeKv({}),
      SHIPPIE_APPS: emptyR2(),
      SHIPPIE_PUBLIC: emptyR2(),
    };
    (globalThis as { fetch?: unknown }).fetch = async (url: string | URL, init?: { body?: string }) => {
      capturedRequests.push({ url: url.toString(), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  test('forwards events to platform with slug injected and 204 response', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/beacon', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
        body: JSON.stringify({ events: [{ name: 'pageview' }, { name: 'click' }] }),
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.url).toBe('https://platform.test/api/internal/ingest-events');
    const body = JSON.parse(capturedRequests[0]!.body);
    expect(body.slug).toBe('zen');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBe(2);
  });

  test('rejects body missing events array with 400', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/beacon', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
        body: JSON.stringify({ notEvents: [] }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test('rate-limits after 120 req/min from one client', async () => {
    const doPost = () =>
      app.fetch(
        new Request('https://zen.shippie.app/__shippie/beacon', {
          method: 'POST',
          headers: {
            host: 'zen.shippie.app',
            'content-type': 'application/json',
            'x-forwarded-for': '3.3.3.3',
          },
          body: JSON.stringify({ events: [{ name: 'x' }] }),
        }),
        env,
      );
    for (let i = 0; i < 120; i++) await doPost();
    const res = await doPost();
    expect(res.status).toBe(429);
  });

  test('caps events array at 200 when caller sends more', async () => {
    const hugeEvents = Array.from({ length: 500 }, (_, i) => ({ name: 'e', i }));
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/beacon', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json', 'x-forwarded-for': '4.4.4.4' },
        body: JSON.stringify({ events: hugeEvents }),
      }),
      env,
    );
    expect(res.status).toBe(204);
    const body = JSON.parse(capturedRequests[0]!.body);
    expect(body.events.length).toBe(200);
  });
});
