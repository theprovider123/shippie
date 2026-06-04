import type { PageServerLoad } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB || layout.counts.total === 0) {
    return { items: [] };
  }

  const db = getDrizzleClient(platform.env.DB);
  // Join straight to the maker's owned apps instead of materialising every
  // app id first — scales with the feedback table, not the app count.
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
    .where(and(eq(schema.apps.makerId, layout.user.id), eq(schema.apps.isArchived, false)))
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(100);

  return { items: rows };
};
