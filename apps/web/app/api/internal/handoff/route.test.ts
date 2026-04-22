/**
 * Tests for /api/internal/handoff — the platform-side dispatcher the
 * worker's /__shippie/handoff route proxies to via a signed POST.
 *
 * We import the POST handler directly, build a NextRequest-like mock,
 * and stub globalThis.fetch to capture Resend calls.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { signWorkerRequest } from '@shippie/session-crypto';
import { createDb, runMigrations } from '@shippie/db';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);

const SECRET = 'worker-platform-secret-abcdef01';

interface MockRequestInit {
  path: string;
  method?: string;
  body: string;
  headers?: Record<string, string>;
}

function mockNextRequest(init: MockRequestInit): NextRequest {
  const headers = new Headers(init.headers ?? {});
  return {
    url: `https://shippie.app${init.path}`,
    method: init.method ?? 'POST',
    headers,
    text: async () => init.body,
  } as unknown as NextRequest;
}

async function signedRequest(path: string, body: string): Promise<NextRequest> {
  const { signature, timestamp } = await signWorkerRequest(SECRET, 'POST', path, body);
  return mockNextRequest({
    path,
    body,
    headers: {
      'x-shippie-signature': signature,
      'x-shippie-timestamp': timestamp,
      'content-type': 'application/json',
    },
  });
}

type FetchCall = { url: string; init: RequestInit };

let originalFetch: typeof globalThis.fetch;
let fetchCalls: FetchCall[] = [];

async function setupDb(): Promise<void> {
  // Force a fresh in-memory PGlite handle for each test so we can
  // assert "no subscriptions" cleanly without cross-test pollution.
  process.env.DATABASE_URL = 'pglite://memory';
  const handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(handle);
}

beforeEach(async () => {
  process.env.WORKER_PLATFORM_SECRET = SECRET;
  process.env.RESEND_API_KEY = 'test-resend-key';
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify({ id: 'test-email-id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  await setupDb();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle = undefined;
});

describe('POST /api/internal/handoff', () => {
  const path = '/api/internal/handoff';

  test('email mode: fires one Resend fetch with handoff URL and returns ok', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      mode: 'email',
      email: 'user@example.com',
      handoff_url: 'https://shippie.app/apps/zen-notes?ref=handoff',
    });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0]!;
    expect(call.url).toBe('https://api.resend.com/emails');
    const auth = new Headers(call.init.headers as HeadersInit | undefined).get('authorization');
    expect(auth).toBe('Bearer test-resend-key');
    const sent = call.init.body as string;
    expect(sent).toContain('https://shippie.app/apps/zen-notes?ref=handoff');
    expect(sent).toContain('user@example.com');
  });

  test('rejects unsigned request with 401', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      mode: 'email',
      email: 'user@example.com',
      handoff_url: 'https://shippie.app/apps/zen-notes',
    });
    const req = mockNextRequest({
      path,
      body,
      headers: { 'content-type': 'application/json' },
    });
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
  });

  test('rejects unknown mode with 400', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      mode: 'carrier-pigeon',
      handoff_url: 'https://shippie.app/apps/zen-notes',
    });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(400);
  });

  test('push mode with no subscriptions returns ok + sent:0 and does not call fetch', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      mode: 'push',
      handoff_url: 'https://shippie.app/apps/zen-notes?ref=handoff',
    });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; sent: number };
    expect(json.ok).toBe(true);
    expect(json.sent).toBe(0);
    expect(fetchCalls).toHaveLength(0);
  });
});
