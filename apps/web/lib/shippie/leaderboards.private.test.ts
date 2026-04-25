/**
 * Phase B Task 8: negative-test coverage. A private app with ratings + an
 * active deploy must not surface on any public-facing leaderboard query.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema, type ShippieDbHandle } from '@shippie/db';
import { getDb } from '@/lib/db';
import { setupPgliteForTest, teardownPglite } from '@/lib/test-helpers/pglite-harness';
import { queryNew } from './leaderboards';

const MAKER = '00000000-0000-0000-0000-000000000001';

async function reset(slug: string) {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
}

let handle: ShippieDbHandle | undefined;

beforeAll(async () => {
  handle = await setupPgliteForTest();
  const db = await getDb();
  await db
    .insert(schema.users)
    .values({ id: MAKER, email: 'maker@shippie.test' })
    .onConflictDoNothing({ target: schema.users.id });
}, 30_000);

afterAll(async () => {
  await teardownPglite(handle);
});

describe('leaderboards exclude private apps', () => {
  const slug = 'priv-lead-neg';
  beforeEach(async () => {
    await reset(slug);
  });

  test('queryNew excludes visibility_scope=private', async () => {
    const db = await getDb();
    const [row] = await db
      .insert(schema.apps)
      .values({
        slug,
        name: slug,
        type: 'app',
        category: 'tools',
        makerId: MAKER,
        sourceType: 'zip',
        visibilityScope: 'private',
      })
      .returning({ id: schema.apps.id });
    // Need an active deploy too — queryNew filters active_deploy_id is not null.
    const [deploy] = await db
      .insert(schema.deploys)
      .values({
        appId: row!.id,
        version: 1,
        sourceType: 'zip',
        status: 'success',
      })
      .returning({ id: schema.deploys.id });
    await db
      .update(schema.apps)
      .set({ activeDeployId: deploy!.id })
      .where(eq(schema.apps.id, row!.id));

    const rows = await queryNew(db, {});
    expect(rows.find((r) => r.slug === slug)).toBeUndefined();
  });
});
