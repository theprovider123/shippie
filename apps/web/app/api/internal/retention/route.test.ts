/**
 * Tests for /api/internal/retention — the daily cron that drops
 * `app_events_<YYYY_MM>` partitions older than 2 calendar months.
 *
 * The test installs a fake "ancient" partition as a plain table (PGlite
 * may not implement Postgres declarative partitioning, so we create it
 * directly). The retention route issues DROP TABLE IF EXISTS with the
 * same name, which works identically on a plain table or a partition.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { createDb, runMigrations } from '@shippie/db';
import { sql } from 'drizzle-orm';
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

async function tableExists(
  db: import('@shippie/db').ShippieDbHandle['db'],
  name: string,
): Promise<boolean> {
  const res = (await db.execute(sql`
    select 1 as x from information_schema.tables where table_name = ${name} limit 1
  `)) as unknown as { rows?: unknown[] } | unknown[];
  const rows = Array.isArray(res) ? res : (res?.rows ?? []);
  return rows.length > 0;
}

beforeEach(async () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = CRON_TOKEN;
  await setupDb();
});

afterEach(() => {
  delete process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle = undefined;
});

describe('POST /api/internal/retention', () => {
  test('drops the partition for two-months-ago and returns its name', async () => {
    // Today is 2026-04-21 (per the project memory). Two calendar
    // months before is 2026-02. Seed an `app_events_2026_02` table
    // directly so we can verify it gets dropped. Use a unique app_id
    // column so the plain-table definition works even if PGlite does
    // not support PARTITION OF.
    const handle = (await (globalThis as unknown as {
      __shippieDbHandle: Promise<{ db: import('@shippie/db').ShippieDbHandle['db'] }>;
    }).__shippieDbHandle);
    const db = handle.db;
    await db.execute(sql`CREATE TABLE app_events_2026_02 (payload text)`);
    expect(await tableExists(db, 'app_events_2026_02')).toBe(true);

    const { POST } = await import('./route.ts');
    const req = mockNextRequest('/api/internal/retention?today=2026-04-21', {
      authorization: `Bearer ${CRON_TOKEN}`,
    });
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as { dropped: string[] };
    expect(json.dropped).toContain('app_events_2026_02');

    expect(await tableExists(db, 'app_events_2026_02')).toBe(false);
  });

  test('rejects unauthorized request with 401', async () => {
    const { POST } = await import('./route.ts');
    const req = mockNextRequest('/api/internal/retention', {});
    const res = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, {});
    expect(res.status).toBe(401);
  });

  test('is idempotent: running twice does not error', async () => {
    const { POST } = await import('./route.ts');
    const req1 = mockNextRequest('/api/internal/retention?today=2026-04-21', {
      authorization: `Bearer ${CRON_TOKEN}`,
    });
    const res1 = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req1, {});
    expect(res1.status).toBe(200);

    const req2 = mockNextRequest('/api/internal/retention?today=2026-04-21', {
      authorization: `Bearer ${CRON_TOKEN}`,
    });
    const res2 = await (POST as (req: NextRequest, ctx: unknown) => Promise<Response>)(req2, {});
    expect(res2.status).toBe(200);
  });
});
