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

describe('POST /__shippie/handoff', () => {
  const app = createApp();
  let env: WorkerEnv;
  const originalFetch = (globalThis as { fetch?: unknown }).fetch;
  const capturedRequests: { url: string; body: string }[] = [];

  beforeEach(() => {
    capturedRequests.length = 0;
    env = {
      SHIPPIE_ENV: 'test',
      PLATFORM_API_URL: 'https://platform.test',
      WORKER_PLATFORM_SECRET: 'test-secret',
      INVITE_SECRET: 'test-invite-secret',
      APP_CONFIG: fakeKv({}),
      SHIPPIE_APPS: emptyR2(),
      SHIPPIE_PUBLIC: emptyR2(),
    };
    (globalThis as { fetch?: unknown }).fetch = async (url: string | URL, init?: { body?: string }) => {
      capturedRequests.push({ url: url.toString(), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  test('forwards a valid email-handoff to platform', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/handoff', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'email', email: 'a@b.co', handoff_url: 'https://zen.shippie.app/?ref=handoff' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.url).toBe('https://platform.test/api/internal/handoff');
    const body = JSON.parse(capturedRequests[0]!.body);
    expect(body.slug).toBe('zen');
    expect(body.mode).toBe('email');
  });

  test('rejects unknown modes with 400', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/handoff', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'carrier-pigeon' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test('rejects invalid email with 400', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/handoff', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'email', email: 'not-an-email', handoff_url: 'https://x' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test('rate-limits after N requests per client', async () => {
    const doPost = () =>
      app.fetch(
        new Request('https://zen.shippie.app/__shippie/handoff', {
          method: 'POST',
          headers: {
            host: 'zen.shippie.app',
            'content-type': 'application/json',
            'x-forwarded-for': '9.9.9.9',
          },
          body: JSON.stringify({ mode: 'email', email: 'a@b.co', handoff_url: 'https://zen.shippie.app/' }),
        }),
        env,
      );
    for (let i = 0; i < 5; i++) await doPost();
    const res = await doPost();
    expect(res.status).toBe(429);
  });
});
