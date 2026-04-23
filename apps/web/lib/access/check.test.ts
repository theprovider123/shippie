// apps/web/lib/access/check.test.ts
import { describe, expect, test, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { checkAccess } from './check';

const MAKER = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';

beforeEach(async () => {
  const db = await getDb();
  await db
    .insert(schema.users)
    .values([
      { id: MAKER, email: 'maker@shippie.test' },
      { id: OTHER, email: 'other@shippie.test' },
    ])
    .onConflictDoNothing({ target: schema.users.id });
});

async function insertApp(slug: string, scope: 'public' | 'unlisted' | 'private'): Promise<string> {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
  const [row] = await db
    .insert(schema.apps)
    .values({
      slug,
      name: slug,
      type: 'app',
      category: 'tools',
      makerId: MAKER,
      sourceType: 'zip',
      visibilityScope: scope,
    })
    .returning({ id: schema.apps.id });
  return row!.id;
}

describe('checkAccess', () => {
  test('public is granted for anyone', async () => {
    const appId = await insertApp('check-pub', 'public');
    const r = await checkAccess({ appId, viewer: {} });
    expect(r).toBe('granted');
  });

  test('private denied for anonymous', async () => {
    const appId = await insertApp('check-priv-anon', 'private');
    const r = await checkAccess({ appId, viewer: {} });
    expect(r).toBe('denied');
  });

  test('private granted for maker', async () => {
    const appId = await insertApp('check-priv-maker', 'private');
    const r = await checkAccess({ appId, viewer: { userId: MAKER } });
    expect(r).toBe('granted');
  });

  test('private granted via app_access row', async () => {
    const appId = await insertApp('check-priv-grant', 'private');
    const db = await getDb();
    await db.insert(schema.appAccess).values({
      appId,
      userId: OTHER,
      source: 'invite_link',
      invitedBy: MAKER,
    });
    const r = await checkAccess({ appId, viewer: { userId: OTHER } });
    expect(r).toBe('granted');
  });

  test('private granted via valid invite cookie', async () => {
    const appId = await insertApp('check-priv-cookie', 'private');
    const r = await checkAccess({
      appId,
      slug: 'check-priv-cookie',
      viewer: { inviteCookie: { app: 'check-priv-cookie', sub: 'anon-1', tok: 't', src: 'invite_link', exp: Math.floor(Date.now() / 1000) + 60 } },
    });
    expect(r).toBe('granted');
  });

  test('private denied if invite cookie app-mismatch', async () => {
    const appId = await insertApp('check-priv-mismatch', 'private');
    const r = await checkAccess({
      appId,
      slug: 'check-priv-mismatch',
      viewer: { inviteCookie: { app: 'some-other-app', sub: 'x', tok: 't', src: 'invite_link', exp: 99999999999 } },
    });
    expect(r).toBe('denied');
  });
});
