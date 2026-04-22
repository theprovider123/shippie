/**
 * Tests for the marketplace leaderboard query helpers.
 *
 * Runs against a PGlite in-memory DB seeded with the project's own
 * migrations so table shapes + visibility flags match prod.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { sql } from 'drizzle-orm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  queryTrending,
  queryNew,
  queryTopRated,
  type LeaderboardEntry,
} from './leaderboards.ts';

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
  await handle.db.execute(
    sql`TRUNCATE TABLE app_events, usage_daily, app_ratings, apps RESTART IDENTITY CASCADE`,
  );
});

interface SeedAppInput {
  slug: string;
  name?: string;
  tagline?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  createdAt?: Date;
  isArchived?: boolean;
  visibilityScope?: string;
  hasActiveDeploy?: boolean;
}

async function seedApp(input: SeedAppInput): Promise<string> {
  // Users table requires a maker. Create one per app lazily.
  const userId = crypto.randomUUID();
  await handle.db.insert(schema.users).values({
    id: userId,
    email: `${input.slug}@test.local`,
    name: input.slug,
  });
  const appId = crypto.randomUUID();
  await handle.db.insert(schema.apps).values({
    id: appId,
    slug: input.slug,
    name: input.name ?? input.slug,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    iconUrl: input.iconUrl ?? null,
    type: 'web_app',
    category: 'utility',
    sourceType: 'zip',
    makerId: userId,
    visibilityScope: input.visibilityScope ?? 'public',
    isArchived: input.isArchived ?? false,
    createdAt: input.createdAt ?? new Date(),
    updatedAt: input.createdAt ?? new Date(),
    // Simulate an active deploy by setting a non-null UUID — the column
    // is typed `uuid` with no FK constraint enforced at this shape level
    // in our tests; we just need it to satisfy `active_deploy_id IS NOT NULL`.
    activeDeployId: input.hasActiveDeploy === false ? null : crypto.randomUUID(),
  });
  return appId;
}

describe('queryTrending', () => {
  test('ranks apps by install_prompt_accepted count in window', async () => {
    const now = new Date('2026-04-21T00:00:00Z');
    await seedApp({ slug: 'alpha', name: 'Alpha', tagline: 'A' });
    await seedApp({ slug: 'bravo', name: 'Bravo', tagline: 'B' });
    await seedApp({ slug: 'charlie', name: 'Charlie', tagline: 'C' });

    const d = (offset: number) => {
      const t = new Date(now);
      t.setUTCDate(t.getUTCDate() - offset);
      t.setUTCHours(0, 0, 0, 0);
      return t;
    };

    // Within last 7 days: alpha=5, bravo=10, charlie=3 → order bravo, alpha, charlie
    await handle.db.insert(schema.usageDaily).values([
      { appId: 'alpha', day: d(1), eventType: 'install_prompt_accepted', count: 2 },
      { appId: 'alpha', day: d(2), eventType: 'install_prompt_accepted', count: 3 },
      { appId: 'bravo', day: d(1), eventType: 'install_prompt_accepted', count: 6 },
      { appId: 'bravo', day: d(3), eventType: 'install_prompt_accepted', count: 4 },
      { appId: 'charlie', day: d(1), eventType: 'install_prompt_accepted', count: 3 },
      // Noise outside window — 30 days old — should be ignored
      { appId: 'alpha', day: d(30), eventType: 'install_prompt_accepted', count: 999 },
      // Noise with other event type — should be ignored
      { appId: 'charlie', day: d(1), eventType: 'install_prompt_shown', count: 999 },
    ]);

    const results = await queryTrending(handle.db, { days: 7, limit: 12 });
    expect(results.map((r) => r.slug)).toEqual(['bravo', 'alpha', 'charlie']);
    expect(results[0]!.score).toBe(10);
    expect(results[1]!.score).toBe(5);
    expect(results[2]!.score).toBe(3);
    expect(results[0]!.name).toBe('Bravo');
    expect(results[0]!.taglineOrDesc).toBe('B');
  });

  test('skips archived and non-public apps', async () => {
    const now = new Date();
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(0, 0, 0, 0);

    await seedApp({ slug: 'visible', name: 'Visible' });
    await seedApp({ slug: 'archived', name: 'Archived', isArchived: true });
    await seedApp({ slug: 'private', name: 'Private', visibilityScope: 'private' });

    await handle.db.insert(schema.usageDaily).values([
      { appId: 'visible', day: d, eventType: 'install_prompt_accepted', count: 1 },
      { appId: 'archived', day: d, eventType: 'install_prompt_accepted', count: 99 },
      { appId: 'private', day: d, eventType: 'install_prompt_accepted', count: 99 },
    ]);

    const results = await queryTrending(handle.db, {});
    expect(results.map((r) => r.slug)).toEqual(['visible']);
  });
});

describe('queryNew', () => {
  test('returns apps created within the window, newest first', async () => {
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

    await seedApp({ slug: 'brandnew', name: 'Brand New', createdAt: ago(1) });
    await seedApp({ slug: 'weekold', name: 'Week Old', createdAt: ago(7) });
    await seedApp({ slug: 'almost', name: 'Almost', createdAt: ago(13) });
    await seedApp({ slug: 'tooold', name: 'Too Old', createdAt: ago(30) });

    const results = await queryNew(handle.db, { days: 14, limit: 12 });
    expect(results.map((r) => r.slug)).toEqual(['brandnew', 'weekold', 'almost']);
    // Score is unix-ms timestamp (newer = larger)
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    expect(results[1]!.score).toBeGreaterThan(results[2]!.score);
  });

  test('skips archived and non-public apps', async () => {
    const now = Date.now();
    const recent = new Date(now - 1 * 24 * 60 * 60 * 1000);

    await seedApp({ slug: 'visible', name: 'V', createdAt: recent });
    await seedApp({ slug: 'archived', name: 'A', createdAt: recent, isArchived: true });
    await seedApp({ slug: 'private', name: 'P', createdAt: recent, visibilityScope: 'private' });

    const results = await queryNew(handle.db, {});
    expect(results.map((r) => r.slug)).toEqual(['visible']);
  });
});

describe('queryTopRated', () => {
  test('ranks apps with ≥minRatings by avg rating desc', async () => {
    await seedApp({ slug: 'great', name: 'Great' });
    await seedApp({ slug: 'perfect', name: 'Perfect' });
    await seedApp({ slug: 'good', name: 'Good' });

    // great: 5 ratings averaging 4.8 → (5,5,5,5,4) = 24/5 = 4.8
    await handle.db.insert(schema.appRatings).values([
      { appId: 'great', userId: 'u1', rating: 5 },
      { appId: 'great', userId: 'u2', rating: 5 },
      { appId: 'great', userId: 'u3', rating: 5 },
      { appId: 'great', userId: 'u4', rating: 5 },
      { appId: 'great', userId: 'u5', rating: 4 },
    ]);
    // perfect: only 2 ratings avg 5 — below minRatings=3, must be excluded
    await handle.db.insert(schema.appRatings).values([
      { appId: 'perfect', userId: 'u1', rating: 5 },
      { appId: 'perfect', userId: 'u2', rating: 5 },
    ]);
    // good: 3 ratings avg 4.5 → (5,4,5) wait that's 14/3=4.67; use (5,4,4) = 4.333;
    // let's do (5,4,5) avg=4.666. We need something clearly less than 4.8.
    // (4,4,5) = 13/3 ≈ 4.333
    await handle.db.insert(schema.appRatings).values([
      { appId: 'good', userId: 'u1', rating: 4 },
      { appId: 'good', userId: 'u2', rating: 4 },
      { appId: 'good', userId: 'u3', rating: 5 },
    ]);

    const results = await queryTopRated(handle.db, { minRatings: 3, limit: 12 });
    expect(results.map((r) => r.slug)).toEqual(['great', 'good']);
    // Score: avg rating × 100
    expect(results[0]!.score).toBe(Math.round(4.8 * 100));
    expect(results[1]!.score).toBe(Math.round((13 / 3) * 100));
  });

  test('skips archived and non-public apps', async () => {
    await seedApp({ slug: 'visible', name: 'V' });
    await seedApp({ slug: 'archived', name: 'A', isArchived: true });
    await seedApp({ slug: 'private', name: 'P', visibilityScope: 'private' });

    const ratings = (slug: string) => [
      { appId: slug, userId: 'u1', rating: 5 },
      { appId: slug, userId: 'u2', rating: 5 },
      { appId: slug, userId: 'u3', rating: 5 },
    ];
    await handle.db.insert(schema.appRatings).values([
      ...ratings('visible'),
      ...ratings('archived'),
      ...ratings('private'),
    ]);

    const results = await queryTopRated(handle.db, {});
    expect(results.map((r) => r.slug)).toEqual(['visible']);
  });
});

// Satisfy TS-unused-import linter for the type export.
const _typeCheck: LeaderboardEntry | undefined = undefined;
void _typeCheck;
