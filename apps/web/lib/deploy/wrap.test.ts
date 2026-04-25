import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { schema, type ShippieDbHandle } from '@shippie/db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { setupPgliteForTest, teardownPglite } from '@/lib/test-helpers/pglite-harness';
import { createWrappedApp } from './wrap';

async function cleanup(slug: string) {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
}

let handle: ShippieDbHandle | undefined;

beforeAll(async () => {
  handle = await setupPgliteForTest();
  const db = await getDb();
  await db
    .insert(schema.users)
    .values({ id: '00000000-0000-0000-0000-000000000001', email: 'maker@shippie.test' })
    .onConflictDoNothing({ target: schema.users.id });
}, 30_000);

afterAll(async () => {
  await teardownPglite(handle);
});

describe('createWrappedApp', () => {
  const testSlug = 'wrap-test-mevrouw';
  beforeEach(() => cleanup(testSlug));

  test('rejects non-https upstream', async () => {
    const r = await createWrappedApp({
      slug: testSlug,
      makerId: '00000000-0000-0000-0000-000000000001',
      upstreamUrl: 'http://insecure.example.com',
      name: 'Test',
      type: 'app',
      category: 'tools',
      reservedSlugs: new Set(),
    });
    if (r.success) throw new Error('expected failure');
    expect(r.reason).toBe('upstream_not_https');
  });

  test('rejects reserved slug', async () => {
    const r = await createWrappedApp({
      slug: 'admin',
      makerId: '00000000-0000-0000-0000-000000000001',
      upstreamUrl: 'https://example.com',
      name: 'Test',
      type: 'app',
      category: 'tools',
      reservedSlugs: new Set(['admin']),
    });
    if (r.success) throw new Error('expected failure');
    expect(r.reason).toBe('slug_reserved');
  });

  test('happy path: inserts app + deploy row with source_kind=wrapped_url', async () => {
    const r = await createWrappedApp({
      slug: testSlug,
      makerId: '00000000-0000-0000-0000-000000000001',
      upstreamUrl: 'https://mevrouw.vercel.app',
      name: 'Mevrouw',
      type: 'app',
      category: 'tools',
      reservedSlugs: new Set(),
    });
    if (!r.success) throw new Error(`expected success, got ${r.reason}`);
    expect(r.slug).toBe(testSlug);
    expect(r.liveUrl).toBe('https://wrap-test-mevrouw.shippie.app/');
    expect(r.runtimeConfig.requiredRedirectUris).toEqual([
      'https://wrap-test-mevrouw.shippie.app/api/auth/callback',
    ]);

    const db = await getDb();
    const [row] = await db.select().from(schema.apps).where(eq(schema.apps.slug, testSlug));
    expect(row?.sourceKind).toBe('wrapped_url');
    expect(row?.upstreamUrl).toBe('https://mevrouw.vercel.app');
  });
});
