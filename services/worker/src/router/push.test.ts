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

describe('__shippie/push', () => {
  const app = createApp();
  let env: WorkerEnv;
  let kvData: Record<string, string>;
  const capturedRequests: { url: string; body: string }[] = [];

  beforeEach(() => {
    capturedRequests.length = 0;
    kvData = {};
    env = {
      SHIPPIE_ENV: 'test',
      PLATFORM_API_URL: 'https://platform.test',
      WORKER_PLATFORM_SECRET: 'test-secret',
      APP_CONFIG: fakeKv(kvData),
      SHIPPIE_APPS: emptyR2(),
      SHIPPIE_PUBLIC: emptyR2(),
    };
    (globalThis as { fetch?: unknown }).fetch = async (url: string | URL, init?: { body?: string }) => {
      capturedRequests.push({ url: url.toString(), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  test('GET /vapid-key returns the VAPID public key when configured', async () => {
    kvData['push:vapid_public'] = 'abc';
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/push/vapid-key', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key?: string };
    expect(body.key).toBe('abc');
  });

  test('GET /vapid-key returns 503 when no key is set', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/push/vapid-key', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(503);
  });

  test('POST /subscribe forwards subscription to platform with slug injected', async () => {
    const subscription = { endpoint: 'https://fcm.example/xyz', keys: { p256dh: 'k', auth: 'a' } };
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/push/subscribe', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify(subscription),
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(capturedRequests[0]?.url).toBe('https://platform.test/api/internal/push/subscribe');
    const body = JSON.parse(capturedRequests[0]!.body);
    expect(body.slug).toBe('zen');
    expect(body.subscription.endpoint).toBe(subscription.endpoint);
  });

  test('POST /unsubscribe forwards endpoint to platform', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/push/unsubscribe', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://fcm.example/xyz' }),
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(capturedRequests[0]?.url).toBe('https://platform.test/api/internal/push/unsubscribe');
    const body = JSON.parse(capturedRequests[0]!.body);
    expect(body.slug).toBe('zen');
    expect(body.endpoint).toBe('https://fcm.example/xyz');
  });

  test('POST /unsubscribe rejects 400 when endpoint missing', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/push/unsubscribe', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});
