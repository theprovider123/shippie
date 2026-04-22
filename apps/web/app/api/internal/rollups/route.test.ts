/**
 * Tests for /api/internal/rollups — the cron endpoint that reads
 * yesterday's `app_events` slice and upserts it into `usage_daily`.
 *
 * Auth follows `authorizeCron` (CRON_SECRET / SHIPPIE_INTERNAL_CRON_TOKEN).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { createDb, runMigrations, schema } from '@shippie/db';
import { and, eq } from 'drizzle-orm';
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

const CRON_TOKEN = 'shippie-test-cron-token';

function mockNextRequest(path: string, headers: Record<string, string>): NextRequest {
  return {
    url: `https://shippie.app${path}`,
    method: 'POST',
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

async function setupDb(): Promise<void> {
  process.env.DATABASE_URL = 'pglite://memory';
  const handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(handle);
}

beforeEach(async () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = CRON_TOKEN;
  await setupDb();
});

afterEach(() => {
  delete process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle = undefined;
});

describe('POST /api/internal/rollups', () => {
  test('rolls up 3 events in the seeded partition into a single usage_daily row', async () => {
    // Seed three events on 2026-04-20 (all within app_events_2026_04).
    // The rollup call uses ?day=2026-04-20 to target that bucket.
    const handle = (await (globalThis as unknown as {
      __shippieDbHandle: Promise<{ db: import('@shippie/db').ShippieDbHandle['db'] }>;
    }).__shippieDbHandle);
    const db = handle.db;
    const day = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
    await db.insert(schema.appEvents).values([
      {
        appId: 'zen-notes',
        sessionId: 's1',
        eventType: 'session_start',
        metadata: {},
        ts: new Date(Date.UTC(2026, 3, 20, 1, 0, 0)),
      },
      {
        appId: 'zen-notes',
        sessionId: 's2',
        eventType: 'session_start',
        metadata: {},
        ts: new Date(Date.UTC(2026, 3, 20, 10, 0, 0)),
      },
      {
        appId: 'zen-notes',
        sessionId: 's3',
        eventType: 'session_start',
        metadata: {},
        ts: new Date(Date.UTC(2026, 3, 20, 23, 59, 0)),
      },
    ]);

    const { POST } = await import('./route.ts');
    const req = mockNextRequest('/api/internal/rollups?day=2026-04-20', {
      authorization: `Bearer ${CRON_TOKEN}`,
    });
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rolled_up: number; apps: number };
    expect(json.rolled_up).toBe(1);
    expect(json.apps).toBe(1);

    const rows = await db
      .select()
      .from(schema.usageDaily)
      .where(
        and(
          eq(schema.usageDaily.appId, 'zen-notes'),
          eq(schema.usageDaily.eventType, 'session_start'),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.count)).toBe(3);
    expect(rows[0]!.day.toISOString()).toBe(day.toISOString());
  });

  test('rejects unauthorized request with 401', async () => {
    const { POST } = await import('./route.ts');
    const req = mockNextRequest('/api/internal/rollups', {});
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(401);
  });
});
