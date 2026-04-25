/**
 * Tests for marketplace ratings helpers.
 *
 * Runs against a PGlite in-memory DB seeded with the project's own
 * migrations so the `app_ratings` shape matches prod. One handle is
 * shared across tests via `beforeAll`; per-test isolation is via
 * TRUNCATE in `beforeEach`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createDb, runMigrations, type ShippieDbHandle } from '@shippie/db';
import { sql } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  queryRatingSummary,
  queryLatestReviews,
  queryUserRating,
  upsertRating,
} from './ratings.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'db', 'migrations');

let handle: ShippieDbHandle;

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite://memory';
  handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
}, 30_000);

beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE TABLE app_ratings`);
});

afterAll(async () => {
  if (handle) await handle.close();
});

describe('queryRatingSummary', () => {
  test('returns zeros when no ratings exist', async () => {
    const r = await queryRatingSummary(handle.db, 'zen');
    expect(r.average).toBe(0);
    expect(r.count).toBe(0);
    expect(r.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  test('computes average and distribution', async () => {
    await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 5 });
    await upsertRating(handle.db, { appId: 'zen', userId: 'u2', rating: 4 });
    await upsertRating(handle.db, { appId: 'zen', userId: 'u3', rating: 5 });
    const r = await queryRatingSummary(handle.db, 'zen');
    expect(r.count).toBe(3);
    expect(Math.abs(r.average - 14 / 3)).toBeLessThan(0.0001);
    expect(r.distribution[5]).toBe(2);
    expect(r.distribution[4]).toBe(1);
    expect(r.distribution[1]).toBe(0);
  });

  test('scopes to app_id', async () => {
    await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 5 });
    await upsertRating(handle.db, { appId: 'other', userId: 'u2', rating: 1 });
    const r = await queryRatingSummary(handle.db, 'zen');
    expect(r.count).toBe(1);
    expect(r.average).toBe(5);
  });
});

describe('queryLatestReviews', () => {
  test('returns only rows with non-empty review text, newest first', async () => {
    await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 5, review: 'great' });
    await upsertRating(handle.db, { appId: 'zen', userId: 'u2', rating: 4, review: null });
    await upsertRating(handle.db, { appId: 'zen', userId: 'u3', rating: 3, review: 'meh' });
    const r = await queryLatestReviews(handle.db, 'zen', 10);
    expect(r.length).toBe(2);
    const texts = r.map((x) => x.review);
    expect(texts).toContain('great');
    expect(texts).toContain('meh');
  });

  test('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await upsertRating(handle.db, { appId: 'zen', userId: 'u' + i, rating: 4, review: 'r' + i });
    }
    const r = await queryLatestReviews(handle.db, 'zen', 2);
    expect(r.length).toBe(2);
  });
});

describe('queryUserRating', () => {
  test('returns null when user has no rating', async () => {
    expect(await queryUserRating(handle.db, 'zen', 'u1')).toBeNull();
  });

  test('returns existing rating', async () => {
    await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 4, review: 'ok' });
    const r = await queryUserRating(handle.db, 'zen', 'u1');
    expect(r?.rating).toBe(4);
    expect(r?.review).toBe('ok');
  });
});

describe('upsertRating', () => {
  test('updates on conflict (app, user)', async () => {
    await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 3, review: 'first' });
    await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 5, review: 'updated' });
    const r = await queryUserRating(handle.db, 'zen', 'u1');
    expect(r?.rating).toBe(5);
    expect(r?.review).toBe('updated');
  });

  test('rejects ratings outside 1–5', async () => {
    let threw = false;
    try {
      await upsertRating(handle.db, { appId: 'zen', userId: 'u1', rating: 7 });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toBe('invalid_rating');
    }
    expect(threw).toBe(true);
  });
});
