/**
 * Tests for /api/internal/retention — the daily cron that drops
 * `app_events_<YYYY_MM>` partitions older than 2 calendar months.
 *
 * The test installs a fake "ancient" partition as a plain table (PGlite
 * may not implement Postgres declarative partitioning, so we create it
 * directly). The retention route issues DROP TABLE IF EXISTS with the
 * same name, which works identically on a plain table or a partition.
 *
 * One PGlite per file (beforeAll) keeps the full suite stable.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { createDb, runMigrations, type ShippieDbHandle } from '@shippie/db';
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

async function tableExists(
  db: ShippieDbHandle['db'],
  name: string,
): Promise<boolean> {
  const res = (await db.execute(sql`
    select 1 as x from information_schema.tables where table_name = ${name} limit 1
  `)) as unknown as { rows?: unknown[] } | unknown[];
  const rows = Array.isArray(res) ? res : (res?.rows ?? []);
  return rows.length > 0;
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
  // Reset: each test recreates the fake partition it needs. Drop it
  // here defensively in case a previous test already dropped and we
  // want a clean slate.
  await handle.db.execute(sql`DROP TABLE IF EXISTS app_events_2026_02`);
});

describe('POST /api/internal/retention', () => {
  test('drops the partition for two-months-ago and returns its name', async () => {
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
