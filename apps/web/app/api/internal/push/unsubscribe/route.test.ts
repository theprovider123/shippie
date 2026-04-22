/**
 * Tests for /api/internal/push/unsubscribe — deletes a wrapper push
 * subscription by endpoint. Invoked by the worker after signing.
 *
 * One PGlite per file (beforeAll) + TRUNCATE between tests to avoid
 * accumulating WASM instances in the full `bun test` suite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { signWorkerRequest } from '@shippie/session-crypto';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { eq, sql } from 'drizzle-orm';
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
  '..',
  'packages',
  'db',
  'migrations',
);

const SECRET = 'worker-platform-secret-abcdef01';

function mockNextRequest(
  path: string,
  body: string,
  headers: Record<string, string>,
): NextRequest {
  return {
    url: `https://shippie.app${path}`,
    method: 'POST',
    headers: new Headers(headers),
    text: async () => body,
  } as unknown as NextRequest;
}

async function signedRequest(path: string, body: string): Promise<NextRequest> {
  const { signature, timestamp } = await signWorkerRequest(SECRET, 'POST', path, body);
  return mockNextRequest(path, body, {
    'x-shippie-signature': signature,
    'x-shippie-timestamp': timestamp,
    'content-type': 'application/json',
  });
}

let handle: ShippieDbHandle;

beforeAll(async () => {
  process.env.WORKER_PLATFORM_SECRET = SECRET;
  process.env.DATABASE_URL = 'pglite://memory';
  handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(handle);
}, 30_000);

afterAll(async () => {
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle = undefined;
  if (handle) await handle.close();
}, 30_000);

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE wrapper_push_subscriptions`);
});

describe('POST /api/internal/push/unsubscribe', () => {
  const path = '/api/internal/push/unsubscribe';

  test('deletes the subscription row', async () => {
    const db = handle.db;
    await db.insert(schema.wrapperPushSubscriptions).values({
      endpoint: 'https://push.example.com/sub/abc',
      appId: 'zen-notes',
      keys: { p256dh: 'k', auth: 'a' },
    });
    let rows = await db
      .select()
      .from(schema.wrapperPushSubscriptions)
      .where(eq(schema.wrapperPushSubscriptions.endpoint, 'https://push.example.com/sub/abc'));
    expect(rows).toHaveLength(1);

    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      endpoint: 'https://push.example.com/sub/abc',
    });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(204);

    rows = await db
      .select()
      .from(schema.wrapperPushSubscriptions)
      .where(eq(schema.wrapperPushSubscriptions.endpoint, 'https://push.example.com/sub/abc'));
    expect(rows).toHaveLength(0);
  });

  test('is idempotent — deleting a missing row still returns 204', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      endpoint: 'https://push.example.com/sub/missing',
    });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(204);
  });

  test('rejects unsigned request with 401', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      endpoint: 'https://push.example.com/sub/abc',
    });
    const req = mockNextRequest(path, body, { 'content-type': 'application/json' });
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(401);
  });

  test('rejects malformed body with 400', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({ slug: 'zen-notes' }); // missing endpoint
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(400);
  });
});
