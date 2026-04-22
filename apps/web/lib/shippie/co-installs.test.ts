/**
 * Tests for queryCoInstalls — the marketplace co-install recommender
 * that reads from user_touch_graph.
 *
 * Shared PGlite handle + TRUNCATE between tests, same pattern as
 * ratings.test.ts.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { sql } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryCoInstalls } from './co-installs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'db', 'migrations');

let handle: ShippieDbHandle;

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite://memory';
  handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
}, 30_000);

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE user_touch_graph`);
});

describe('queryCoInstalls', () => {
  test('empty when no rows', async () => {
    const r = await queryCoInstalls(handle.db, 'zen');
    expect(r).toEqual([]);
  });

  test('ranks by user count, descending', async () => {
    await handle.db.insert(schema.userTouchGraph).values([
      { appA: 'alpha', appB: 'zen', users: 10 },
      { appA: 'beta', appB: 'zen', users: 25 },
      { appA: 'zen', appB: 'zulu', users: 5 },
    ]);
    const r = await queryCoInstalls(handle.db, 'zen');
    expect(r.map((x) => x.appId)).toEqual(['beta', 'alpha', 'zulu']);
    expect(r[0]?.score).toBe(25);
  });

  test('excludes pairs that do not include appId', async () => {
    await handle.db.insert(schema.userTouchGraph).values([
      { appA: 'alpha', appB: 'beta', users: 100 },
      { appA: 'gamma', appB: 'zen', users: 1 },
    ]);
    const r = await queryCoInstalls(handle.db, 'zen');
    expect(r.length).toBe(1);
    expect(r[0]?.appId).toBe('gamma');
  });

  test('respects limit', async () => {
    await handle.db.insert(schema.userTouchGraph).values([
      { appA: 'a', appB: 'zen', users: 1 },
      { appA: 'b', appB: 'zen', users: 2 },
      { appA: 'c', appB: 'zen', users: 3 },
    ]);
    const r = await queryCoInstalls(handle.db, 'zen', 2);
    expect(r.length).toBe(2);
    expect(r.map((x) => x.appId)).toEqual(['c', 'b']);
  });
});
