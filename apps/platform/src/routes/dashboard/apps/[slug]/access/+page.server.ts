/**
 * /dashboard/apps/[slug]/access — visibility + invites management.
 */
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB) return { ...layout, invites: [], access: [] };

  const db = getDrizzleClient(platform.env.DB);
  const invites = await db
    .select()
    .from(schema.appInvites)
    .where(eq(schema.appInvites.appId, layout.app.id))
    .orderBy(schema.appInvites.createdAt);

  const access = await db
    .select()
    .from(schema.appAccess)
    .where(eq(schema.appAccess.appId, layout.app.id));

  return { ...layout, invites, access };
};
