import type { PageServerLoad } from './$types';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB || layout.myApps.length === 0) {
    return { ...layout, items: [] };
  }

  const db = getDrizzleClient(platform.env.DB);
  const appIds = layout.myApps.map((app) => app.id);
  const rows = await db
    .select({
      id: schema.feedbackItems.id,
      appId: schema.feedbackItems.appId,
      appName: schema.apps.name,
      appSlug: schema.apps.slug,
      type: schema.feedbackItems.type,
      status: schema.feedbackItems.status,
      rating: schema.feedbackItems.rating,
      title: schema.feedbackItems.title,
      body: schema.feedbackItems.body,
      voteCount: schema.feedbackItems.voteCount,
      createdAt: schema.feedbackItems.createdAt,
      metadata: schema.feedbackItems.metadata,
    })
    .from(schema.feedbackItems)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.feedbackItems.appId))
    .where(inArray(schema.feedbackItems.appId, appIds))
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(100);

  return { ...layout, items: rows };
};
