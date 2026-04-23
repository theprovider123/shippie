// apps/web/lib/access/check.ts
import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import type { InviteGrant } from '../../../../packages/access/src/invite-cookie';

export interface CheckAccessInput {
  appId: string;
  slug?: string;
  viewer: {
    userId?: string;
    email?: string;
    inviteCookie?: InviteGrant;
  };
}

export type AccessResult = 'granted' | 'denied';

export async function checkAccess(input: CheckAccessInput): Promise<AccessResult> {
  const db = await getDb();
  const [app] = await db
    .select({
      visibilityScope: schema.apps.visibilityScope,
      makerId: schema.apps.makerId,
      slug: schema.apps.slug,
    })
    .from(schema.apps)
    .where(eq(schema.apps.id, input.appId))
    .limit(1);
  if (!app) return 'denied';
  if (app.visibilityScope !== 'private') return 'granted';

  const viewer = input.viewer;

  // Owner always has access
  if (viewer.userId && viewer.userId === app.makerId) return 'granted';

  // Invite cookie (anonymous or signed-in grant)
  if (viewer.inviteCookie) {
    const slug = input.slug ?? app.slug;
    if (viewer.inviteCookie.app === slug) return 'granted';
  }

  // Durable access via user id
  if (viewer.userId) {
    const [row] = await db
      .select({ id: schema.appAccess.id })
      .from(schema.appAccess)
      .where(
        and(
          eq(schema.appAccess.appId, input.appId),
          eq(schema.appAccess.userId, viewer.userId),
          isNull(schema.appAccess.revokedAt),
        ),
      )
      .limit(1);
    if (row) return 'granted';
  }

  // Durable access via email
  if (viewer.email) {
    const [row] = await db
      .select({ id: schema.appAccess.id })
      .from(schema.appAccess)
      .where(
        and(
          eq(schema.appAccess.appId, input.appId),
          eq(schema.appAccess.email, viewer.email),
          isNull(schema.appAccess.revokedAt),
        ),
      )
      .limit(1);
    if (row) return 'granted';
  }

  return 'denied';
}
