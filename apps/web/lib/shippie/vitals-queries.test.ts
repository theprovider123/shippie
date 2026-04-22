/**
 * Tests for the web-vitals percentile query helper.
 *
 * Runs against a PGlite in-memory DB seeded with the project's own
 * migrations so the `app_events` shape matches prod. Events land with
 * `event_type = 'web_vital'` and `metadata = { name, value }`.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { sql } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryWebVitals } from './vitals-queries.ts';

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

// No afterAll close — other test files share the in-memory PGlite URL
// convention; closing the handle here races with their own beforeAll
// and yields `PGlite is closed` downstream. The OS reclaims memory
// when the test process exits.

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE app_events`);
});

async function seedVital(
  appId: string,
  name: 'LCP' | 'CLS' | 'INP',
  value: number,
  tsIso: string,
) {
  await handle.db.insert(schema.appEvents).values({
    appId,
    sessionId: 'sess-' + Math.random().toString(36).slice(2, 8),
    eventType: 'web_vital',
    metadata: { name, value },
    ts: new Date(tsIso),
  });
}

describe('queryWebVitals', () => {
  test('returns empty array when no vitals events exist', async () => {
    const r = await queryWebVitals(handle.db, { appId: 'zen', days: 30 });
    expect(r).toEqual([]);
  });

  test('computes p50/p75/p95 per vital', async () => {
    // Seed LCP samples 100..1000 stepping by 100 => 10 samples.
    for (let v = 100; v <= 1000; v += 100) {
      await seedVital('zen', 'LCP', v, '2026-04-21T12:00:00Z');
    }
    const r = await queryWebVitals(handle.db, {
      appId: 'zen',
      days: 30,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    const lcp = r.find((s) => s.name === 'LCP')!;
    expect(lcp.samples).toBe(10);
    // p50 at index 5 = 600, p75 at index 7 = 800, p95 at index 9 = 1000.
    expect(lcp.p50).toBe(600);
    expect(lcp.p75).toBe(800);
    expect(lcp.p95).toBe(1000);
  });

  test('omits vitals with zero samples', async () => {
    await seedVital('zen', 'LCP', 500, '2026-04-21T12:00:00Z');
    const r = await queryWebVitals(handle.db, {
      appId: 'zen',
      days: 30,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    expect(r.length).toBe(1);
    expect(r[0]?.name).toBe('LCP');
  });

  test('scopes to app_id', async () => {
    await seedVital('zen', 'LCP', 500, '2026-04-21T12:00:00Z');
    await seedVital('other', 'LCP', 999, '2026-04-21T12:00:00Z');
    const r = await queryWebVitals(handle.db, {
      appId: 'zen',
      days: 30,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    const lcp = r.find((s) => s.name === 'LCP')!;
    expect(lcp.samples).toBe(1);
    expect(lcp.p50).toBe(500);
  });

  test('respects the days window', async () => {
    // One event inside the 5-day window ending 2026-04-22, one outside.
    // Both live in the 2026-04 partition so the insert itself succeeds;
    // the 04-10 row is just older than the window start.
    await seedVital('zen', 'CLS', 0.1, '2026-04-20T00:00:00Z');
    await seedVital('zen', 'CLS', 0.9, '2026-04-10T00:00:00Z');
    const r = await queryWebVitals(handle.db, {
      appId: 'zen',
      days: 5,
      endDate: new Date('2026-04-22T00:00:00Z'),
    });
    const cls = r.find((s) => s.name === 'CLS')!;
    expect(cls.samples).toBe(1);
    // Floating-point; bun-test.d.ts shim doesn't declare toBeCloseTo.
    expect(Math.abs(cls.p50 - 0.1)).toBeLessThan(0.00001);
  });
});
