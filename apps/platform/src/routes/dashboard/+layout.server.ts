/**
 * Dashboard layout — auth gate + sidebar data.
 *
 * Redirects to /auth/login if no session. Loads the maker's apps once
 * for the sidebar so child routes can read it from `data.myApps`
 * without re-querying.
 */
import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (!platform?.env.DB) {
    return { user: locals.user, myApps: [] as MyAppRow[] };
  }

  const db = getDrizzleClient(platform.env.DB);
  const myApps = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      type: schema.apps.type,
      themeColor: schema.apps.themeColor,
      latestDeployStatus: schema.apps.latestDeployStatus,
      visibilityScope: schema.apps.visibilityScope,
      lastDeployedAt: schema.apps.lastDeployedAt,
    })
    .from(schema.apps)
    .where(eq(schema.apps.makerId, locals.user.id))
    .orderBy(desc(schema.apps.updatedAt));

  return { user: locals.user, myApps };
};

export type MyAppRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  themeColor: string;
  latestDeployStatus: string | null;
  visibilityScope: string;
  lastDeployedAt: string | null;
};
