/**
 * Tests for the maker analytics query helpers.
 *
 * Runs against a PGlite in-memory DB seeded with the project's own
 * migrations so the `usage_daily` / `app_events` shape matches prod.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { sql } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  queryUsageDaily,
  queryInstallFunnel,
  queryIabBounce,
} from './analytics-queries.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(
  __dirname,
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
}, 30_000);

afterAll(async () => {
  if (handle) await handle.close();
}, 30_000);

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE app_events, usage_daily`);
});

describe('queryUsageDaily', () => {
  test('returns daily counts for a single event type over the window', async () => {
    await handle.db.insert(schema.usageDaily).values([
      {
        appId: 'zen',
        day: new Date('2026-04-20T00:00:00Z'),
        eventType: 'install_prompt_accepted',
        count: 3,
      },
      {
        appId: 'zen',
        day: new Date('2026-04-21T00:00:00Z'),
        eventType: 'install_prompt_accepted',
        count: 5,
      },
      {
        appId: 'other',
        day: new Date('2026-04-21T00:00:00Z'),
        eventType: 'install_prompt_accepted',
        count: 99,
      },
    ]);
    const rows = await queryUsageDaily(handle.db, {
      appId: 'zen',
      eventType: 'install_prompt_accepted',
      days: 30,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    expect(rows.length).toBe(2);
    expect(rows[0]?.count).toBe(3);
    expect(rows[1]?.count).toBe(5);
  });

  test('returns empty array when no rows match', async () => {
    const rows = await queryUsageDaily(handle.db, {
      appId: 'ghost',
      eventType: 'install_prompt_accepted',
      days: 30,
    });
    expect(rows).toEqual([]);
  });
});

describe('queryInstallFunnel', () => {
  test('sums shown / accepted / dismissed over window', async () => {
    await handle.db.insert(schema.usageDaily).values([
      {
        appId: 'zen',
        day: new Date('2026-04-20T00:00:00Z'),
        eventType: 'install_prompt_shown',
        count: 100,
      },
      {
        appId: 'zen',
        day: new Date('2026-04-20T00:00:00Z'),
        eventType: 'install_prompt_accepted',
        count: 12,
      },
      {
        appId: 'zen',
        day: new Date('2026-04-20T00:00:00Z'),
        eventType: 'install_prompt_dismissed',
        count: 30,
      },
    ]);
    const r = await queryInstallFunnel(handle.db, {
      appId: 'zen',
      days: 30,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    expect(r.shown).toBe(100);
    expect(r.accepted).toBe(12);
    expect(r.dismissed).toBe(30);
    expect(r.conversion).toBeCloseTo(0.12, 2);
  });

  test('conversion is 0 when shown=0', async () => {
    const r = await queryInstallFunnel(handle.db, { appId: 'zen', days: 30 });
    expect(r.shown).toBe(0);
    expect(r.conversion).toBe(0);
  });
});

describe('queryIabBounce', () => {
  test('computes rate from detected + bounced counts', async () => {
    await handle.db.insert(schema.usageDaily).values([
      {
        appId: 'zen',
        day: new Date('2026-04-20T00:00:00Z'),
        eventType: 'iab_detected',
        count: 40,
      },
      {
        appId: 'zen',
        day: new Date('2026-04-20T00:00:00Z'),
        eventType: 'iab_bounced',
        count: 10,
      },
    ]);
    const r = await queryIabBounce(handle.db, {
      appId: 'zen',
      days: 30,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    expect(r.detected).toBe(40);
    expect(r.bounced).toBe(10);
    expect(r.rate).toBeCloseTo(0.25, 2);
  });

  test('rate is 0 when detected=0', async () => {
    const r = await queryIabBounce(handle.db, { appId: 'zen', days: 30 });
    expect(r.detected).toBe(0);
    expect(r.rate).toBe(0);
  });
});
