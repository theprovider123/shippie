/**
 * /maker/apps — full apps list.
 *
 * Owns its own query (the layout only loads recents + counts), so the full
 * list is fetched only when this page is viewed. Pagination/search land in a
 * later phase; for now it returns the maker's owned, non-archived apps plus
 * the demo-app diagnostics used by the empty state.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { emptyDemoDiagnostics, loadDemoDiagnostics } from '$server/maker/diagnostics';
import type { MyAppRow } from '../+layout.server';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const { user } = await parent();
  if (!platform?.env.DB) {
    return { apps: [] as MyAppRow[], demoDiagnostics: emptyDemoDiagnostics() };
  }

  const db = getDrizzleClient(platform.env.DB);
  const apps = await db
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
    .where(and(eq(schema.apps.makerId, user.id), eq(schema.apps.isArchived, false)))
    .orderBy(desc(schema.apps.updatedAt));

  return { apps, demoDiagnostics: await loadDemoDiagnostics(db, user.id) };
};
