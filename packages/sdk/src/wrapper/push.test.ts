import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { subscribePush, unsubscribePush, pushSupported } from './push.ts';

const originalWindow = (globalThis as { window?: unknown }).window;
const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
const originalFetch = (globalThis as { fetch?: unknown }).fetch;
const originalAtob = (globalThis as { atob?: unknown }).atob;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
  (globalThis as { navigator?: unknown }).navigator = undefined;
  (globalThis as { fetch?: unknown }).fetch = undefined;
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
  (globalThis as { atob?: unknown }).atob = originalAtob;
});

describe('pushSupported', () => {
  test('false when no serviceWorker', () => {
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { navigator?: unknown }).navigator = {};
    expect(pushSupported()).toBe(false);
  });
  test('true when serviceWorker + PushManager present', () => {
    (globalThis as { window?: unknown }).window = { PushManager: function () {} };
    (globalThis as { navigator?: unknown }).navigator = { serviceWorker: {} };
    expect(pushSupported()).toBe(true);
  });
});

describe('subscribePush', () => {
  test('happy path: fetches vapid key, subscribes, posts subscription', async () => {
    const posted: unknown[] = [];
    (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: { body?: string }) => {
      if (url.endsWith('/__shippie/push/vapid-key')) {
        return new Response(JSON.stringify({ key: 'BASE64KEY' }), { status: 200 });
      }
      if (url.endsWith('/__shippie/push/subscribe')) {
        posted.push(init?.body);
        return new Response('', { status: 204 });
      }
      return new Response('', { status: 404 });
    };
    const fakeSub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc' }) };
    const fakeRegistration = {
      pushManager: {
        subscribe: async () => fakeSub,
      },
    };
    (globalThis as { window?: unknown }).window = { PushManager: function () {} };
    (globalThis as { navigator?: unknown }).navigator = {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    };

    const result = await subscribePush();
    expect(result.ok).toBe(true);
    expect(posted.length).toBe(1);
  });

  test('returns { ok: false } when push unsupported', async () => {
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { navigator?: unknown }).navigator = {};
    const r = await subscribePush();
    expect(r.ok).toBe(false);
  });
});

describe('unsubscribePush', () => {
  test('calls unsubscribe + posts unsubscribe', async () => {
    let unsubCalled = 0;
    let postedTo = '';
    const sub = { endpoint: 'https://push.example/abc', unsubscribe: async () => { unsubCalled += 1; return true; } };
    const fakeRegistration = { pushManager: { getSubscription: async () => sub } };
    (globalThis as { window?: unknown }).window = { PushManager: function () {} };
    (globalThis as { navigator?: unknown }).navigator = { serviceWorker: { ready: Promise.resolve(fakeRegistration) } };
    (globalThis as { fetch?: unknown }).fetch = async (url: string) => {
      postedTo = url;
      return new Response('', { status: 204 });
    };
    const r = await unsubscribePush();
    expect(r.ok).toBe(true);
    expect(unsubCalled).toBe(1);
    expect(postedTo).toContain('/__shippie/push/unsubscribe');
  });

  test('returns ok when no existing subscription', async () => {
    const fakeRegistration = { pushManager: { getSubscription: async () => null } };
    (globalThis as { window?: unknown }).window = { PushManager: function () {} };
    (globalThis as { navigator?: unknown }).navigator = { serviceWorker: { ready: Promise.resolve(fakeRegistration) } };
    (globalThis as { fetch?: unknown }).fetch = async () => new Response('', { status: 204 });
    const r = await unsubscribePush();
    expect(r.ok).toBe(true);
  });
});
