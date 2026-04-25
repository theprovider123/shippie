// apps/web/lib/access/invites.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema, type ShippieDbHandle } from '@shippie/db';
import { getDb } from '@/lib/db';
import { setupPgliteForTest, teardownPglite } from '@/lib/test-helpers/pglite-harness';
import { createLinkInvite, claimInvite, revokeInvite, listInvites } from './invites';

const MAKER = '00000000-0000-0000-0000-000000000001';
const CLAIMER = '00000000-0000-0000-0000-000000000002';

let handle: ShippieDbHandle | undefined;

beforeAll(async () => {
  handle = await setupPgliteForTest();
}, 30_000);

afterAll(async () => {
  await teardownPglite(handle);
});

beforeEach(async () => {
  const db = await getDb();
  await db
    .insert(schema.users)
    .values([
      { id: MAKER, email: 'maker@shippie.test' },
      { id: CLAIMER, email: 'claimer@shippie.test' },
    ])
    .onConflictDoNothing({ target: schema.users.id });
});

async function freshApp(slug: string): Promise<string> {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
  const [row] = await db
    .insert(schema.apps)
    .values({ slug, name: slug, type: 'app', category: 'tools', makerId: MAKER, sourceType: 'zip', visibilityScope: 'private' })
    .returning({ id: schema.apps.id });
  return row!.id;
}

describe('invites', () => {
  test('createLinkInvite returns url-safe token', async () => {
    const appId = await freshApp('inv-create');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{10,}$/);
  });

  test('claimInvite increments used_count and creates app_access row when signed-in', async () => {
    const appId = await freshApp('inv-claim');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    const result = await claimInvite({ token: inv.token, userId: '00000000-0000-0000-0000-000000000002' });
    expect(result.success).toBe(true);

    const db = await getDb();
    const [row] = await db.select().from(schema.appInvites).where(eq(schema.appInvites.id, inv.id));
    expect(row?.usedCount).toBe(1);
    const [access] = await db.select().from(schema.appAccess).where(eq(schema.appAccess.appId, appId));
    expect(access?.userId).toBe('00000000-0000-0000-0000-000000000002');
  });

  test('claimInvite without userId still increments used_count (anonymous)', async () => {
    const appId = await freshApp('inv-anon');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    const result = await claimInvite({ token: inv.token });
    if (!result.success) throw new Error(`expected success, got ${result.reason}`);
    expect(result.anonymous).toBe(true);
  });

  test('claimInvite rejects revoked', async () => {
    const appId = await freshApp('inv-rev');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    await revokeInvite({ id: inv.id, appId, by: MAKER });
    const result = await claimInvite({ token: inv.token });
    if (result.success) throw new Error('expected failure');
    expect(result.reason).toBe('revoked_or_expired');
  });

  test('claimInvite rejects when max_uses hit', async () => {
    const appId = await freshApp('inv-max');
    const inv = await createLinkInvite({ appId, createdBy: MAKER, maxUses: 1 });
    await claimInvite({ token: inv.token });
    const second = await claimInvite({ token: inv.token });
    if (second.success) throw new Error('expected failure');
    expect(second.reason).toBe('uses_exhausted');
  });

  test('listInvites returns only active invites for the given app', async () => {
    const appId = await freshApp('inv-list');
    await createLinkInvite({ appId, createdBy: MAKER });
    const inv2 = await createLinkInvite({ appId, createdBy: MAKER });
    await revokeInvite({ id: inv2.id, appId, by: MAKER });
    const rows = await listInvites({ appId });
    expect(rows.length).toBe(1);
  });
});
