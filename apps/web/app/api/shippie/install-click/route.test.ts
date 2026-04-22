/**
 * Tests for POST /api/shippie/install-click — the marketplace beacon that
 * fires when a user clicks an install button. Writes an `install_click`
 * event into app_events so the rollup cron can attribute installs to
 * their marketplace surface.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
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
  'packages',
  'db',
  'migrations',
);

let handle: ShippieDbHandle;

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite://memory';
  handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    Promise.resolve(handle);
}, 30_000);

afterAll(async () => {
  (globalThis as unknown as { __shippieDbHandle?: Promise<unknown> }).__shippieDbHandle =
    undefined;
  if (handle) await handle.close();
}, 30_000);

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE app_events`);
});

function mockReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    url: 'https://shippie.app/api/shippie/install-click',
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: async () => body,
  } as unknown as NextRequest;
}

type Handler = (req: NextRequest, ctx: unknown) => Promise<Response>;

describe('POST /api/shippie/install-click', () => {
  test('writes an install_click row with the source in metadata', async () => {
    const { POST } = await import('./route.ts');
    const res = await (POST as Handler)(
      mockReq({ slug: 'zen', source: 'category-top-rated' }, { 'x-session-id': 'sess-42' }),
      {},
    );
    expect(res.status).toBe(204);
    const rows = await handle.db
      .select()
      .from(schema.appEvents)
      .where(eq(schema.appEvents.appId, 'zen'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe('install_click');
    expect(rows[0]?.sessionId).toBe('sess-42');
    expect(rows[0]?.metadata).toEqual({ source: 'category-top-rated' });
  });

  test('empty metadata when no source is provided', async () => {
    const { POST } = await import('./route.ts');
    const res = await (POST as Handler)(mockReq({ slug: 'zen' }), {});
    expect(res.status).toBe(204);
    const rows = await handle.db
      .select()
      .from(schema.appEvents)
      .where(eq(schema.appEvents.appId, 'zen'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toEqual({});
  });

  test('truncates source at 64 chars', async () => {
    const long = 'x'.repeat(200);
    const { POST } = await import('./route.ts');
    const res = await (POST as Handler)(mockReq({ slug: 'zen', source: long }), {});
    expect(res.status).toBe(204);
    const rows = await handle.db
      .select()
      .from(schema.appEvents)
      .where(eq(schema.appEvents.appId, 'zen'));
    expect(rows).toHaveLength(1);
    const meta = rows[0]?.metadata as { source?: string };
    expect(meta.source?.length).toBe(64);
  });

  test('missing slug is a no-op (returns 204, writes nothing)', async () => {
    const { POST } = await import('./route.ts');
    const res = await (POST as Handler)(mockReq({ source: 'homepage' }), {});
    expect(res.status).toBe(204);
    const rows = await handle.db.select().from(schema.appEvents);
    expect(rows).toHaveLength(0);
  });

  test('invalid JSON body returns 204 without writing', async () => {
    const req = {
      url: 'https://shippie.app/api/shippie/install-click',
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as NextRequest;
    const { POST } = await import('./route.ts');
    const res = await (POST as Handler)(req, {});
    expect(res.status).toBe(204);
    const rows = await handle.db.select().from(schema.appEvents);
    expect(rows).toHaveLength(0);
  });

  test('falls back to unknown session id when header missing', async () => {
    const { POST } = await import('./route.ts');
    const res = await (POST as Handler)(mockReq({ slug: 'zen', source: 'home' }), {});
    expect(res.status).toBe(204);
    const rows = await handle.db
      .select()
      .from(schema.appEvents)
      .where(eq(schema.appEvents.appId, 'zen'));
    expect(rows[0]?.sessionId).toBe('unknown');
  });
});
