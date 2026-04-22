/**
 * Tests for /api/internal/ingest-events — the platform-side ingestion
 * endpoint the worker posts to after signing.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { signWorkerRequest } from '@shippie/session-crypto';
import { createDb, runMigrations, schema } from '@shippie/db';
import { eq } from 'drizzle-orm';
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

async function setupDb(): Promise<void> {
  process.env.DATABASE_URL = 'pglite://memory';
  const handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(handle);
}

beforeEach(async () => {
  process.env.WORKER_PLATFORM_SECRET = SECRET;
  await setupDb();
});

afterEach(() => {
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle = undefined;
});

describe('POST /api/internal/ingest-events', () => {
  const path = '/api/internal/ingest-events';

  test('ingests two events and writes them to app_events', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      events: [
        {
          event_type: 'session_start',
          session_id: 'sess-1',
          user_id: 'u1',
          metadata: { ref: 'home' },
          ts: '2026-04-21T10:00:00.000Z',
        },
        {
          event_type: 'click',
          session_id: 'sess-1',
          ts: '2026-04-21T10:01:00.000Z',
        },
      ],
    });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(204);

    const handle = await (globalThis as unknown as {
      __shippieDbHandle: Promise<{ db: import('@shippie/db').ShippieDbHandle['db'] }>;
    }).__shippieDbHandle;
    const db = handle.db;
    const rows = await db
      .select()
      .from(schema.appEvents)
      .where(eq(schema.appEvents.appId, 'zen-notes'));
    expect(rows).toHaveLength(2);
    const types = rows.map((r) => r.eventType).sort();
    expect(types).toEqual(['click', 'session_start']);
  });

  test('rejects unsigned request with 401', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({
      slug: 'zen-notes',
      events: [{ event_type: 'session_start', session_id: 'sess-1' }],
    });
    const req = mockNextRequest({
      path,
      body,
      headers: { 'content-type': 'application/json' },
    });
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(401);
  });

  test('rejects malformed body (missing events array) with 400', async () => {
    const { POST } = await import('./route.ts');
    const body = JSON.stringify({ slug: 'zen-notes' });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(400);
  });

  test('rejects events array longer than 200 with 400', async () => {
    const { POST } = await import('./route.ts');
    const events = Array.from({ length: 201 }, (_, i) => ({
      event_type: 'click',
      session_id: `s-${i}`,
    }));
    const body = JSON.stringify({ slug: 'zen-notes', events });
    const req = await signedRequest(path, body);
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(400);
  });
});
