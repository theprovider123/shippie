import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { platformFetch } from './platform-client.ts';
import type { WorkerEnv } from './env.ts';

// Minimal WorkerEnv surface for the client — we only exercise the
// secret + platform URL + timeout + retry plumbing.
const env = {
  SHIPPIE_ENV: 'dev',
  PLATFORM_API_URL: 'https://platform.test',
  WORKER_PLATFORM_SECRET: 'test-secret-0123456789abcdef',
  APP_CONFIG: null as never,
  SHIPPIE_APPS: null as never,
  SHIPPIE_PUBLIC: null as never,
  APP_SESSION_COOKIE_KEY: null as never,
} as unknown as WorkerEnv;

interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[] = [];
let responder: (attempt: number) => Response | Promise<Response>;
const origFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  responder = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(responder(calls.length));
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

test('forwards traceId as x-shippie-trace-id', async () => {
  await platformFetch(env, 'POST', '/api/internal/sdk/analytics', { x: 1 }, { traceId: 'trace-abc' });
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['x-shippie-trace-id'], 'trace-abc');
});

test('does not send trace header when option is omitted', async () => {
  await platformFetch(env, 'POST', '/api/internal/sdk/analytics', { x: 1 });
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['x-shippie-trace-id'], undefined);
});

test('signs every request with signature + timestamp headers', async () => {
  await platformFetch(env, 'POST', '/api/internal/sdk/feedback', { slug: 's' });
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.ok(headers['x-shippie-signature']);
  assert.ok(headers['x-shippie-timestamp']);
  // Timestamp is recent (within last 5s)
  assert.ok(Math.abs(Date.now() - Number(headers['x-shippie-timestamp'])) < 5_000);
});

test('does NOT retry by default on a 500', async () => {
  responder = () => new Response('{"err":"boom"}', { status: 500 });
  const res = await platformFetch(env, 'POST', '/x', { x: 1 });
  assert.equal(res.status, 500);
  assert.equal(calls.length, 1);
});

test('retries on 5xx up to the configured count, then returns the last response', async () => {
  responder = () => new Response('{"err":"boom"}', { status: 503 });
  const res = await platformFetch(
    env,
    'POST',
    '/x',
    { x: 1 },
    { retries: 2, retryBaseMs: 1 },
  );
  assert.equal(res.status, 503);
  assert.equal(calls.length, 3); // 1 + 2 retries
});

test('does NOT retry on 4xx', async () => {
  responder = () => new Response('{"err":"bad"}', { status: 400 });
  const res = await platformFetch(env, 'POST', '/x', { x: 1 }, { retries: 3, retryBaseMs: 1 });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 1);
});

test('returns the first 2xx if a retry succeeds', async () => {
  responder = (attempt) => {
    if (attempt === 1) return new Response('{"err":"flap"}', { status: 502 });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const res = await platformFetch(env, 'POST', '/x', { x: 1 }, { retries: 3, retryBaseMs: 1 });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test('re-throws a network error after exhausting retries', async () => {
  globalThis.fetch = (() => {
    calls.push({ url: 'n/a', init: {} });
    return Promise.reject(new Error('ECONNRESET'));
  }) as unknown as typeof fetch;

  await assert.rejects(
    () => platformFetch(env, 'POST', '/x', { x: 1 }, { retries: 2, retryBaseMs: 1 }),
    /ECONNRESET/,
  );
  assert.equal(calls.length, 3); // 1 + 2 retries
});

test('sets an AbortSignal for the per-attempt timeout', async () => {
  let observedSignal: AbortSignal | null = null;
  globalThis.fetch = ((_: RequestInfo | URL, init: RequestInit = {}) => {
    observedSignal = (init.signal ?? null) as AbortSignal | null;
    calls.push({ url: 'n/a', init });
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as unknown as typeof fetch;

  await platformFetch(env, 'POST', '/x', undefined, { timeoutMs: 500 });
  assert.ok(observedSignal, 'AbortSignal should be attached');
});
