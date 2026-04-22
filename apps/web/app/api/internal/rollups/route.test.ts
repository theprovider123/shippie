/**
 * Tests for /api/internal/rollups — the cron endpoint that reads
 * yesterday's `app_events` slice and upserts it into `usage_daily`.
 *
 * Auth follows `authorizeCron` (CRON_SECRET / SHIPPIE_INTERNAL_CRON_TOKEN).
 *
 * One PGlite per file (beforeAll) + TRUNCATE between tests keeps the
 * full `bun test` suite from accumulating WASM instances.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { and, eq, sql } from 'drizzle-orm';
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

let handle: ShippieDbHandle;

beforeAll(async () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = CRON_TOKEN;
  process.env.DATABASE_URL = 'pglite://memory';
  handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(handle);
}, 30_000);

afterAll(async () => {
  delete process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle = undefined;
  if (handle) await handle.close();
}, 30_000);

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE app_events, usage_daily`);
});

describe('POST /api/internal/rollups', () => {
  test('rolls up 3 events in the seeded partition into a single usage_daily row', async () => {
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
