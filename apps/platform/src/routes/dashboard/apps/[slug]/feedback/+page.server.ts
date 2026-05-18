/**
 * Per-app feedback inbox.
 *
 * Loads feedback for a single app (the one whose ownership the parent
 * layout already verified). Mirrors the all-apps view at
 * /dashboard/feedback but with one app's items and richer status
 * breakdown so the maker can sit on a specific app and triage.
 *
 * Status semantics match the platform-wide moderation contract:
 *   open      — public-visible
 *   reviewing — auto-flagged, held until admin clears
 *   spam      — auto-flagged as spam, held until admin clears
 *   hidden    — admin or maker hid it (still visible to maker for context)
 *   resolved  — maker marked it done
 */
import type { PageServerLoad } from './$types';
import { desc, eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB) return { ...layout, items: [] };

  const db = getDrizzleClient(platform.env.DB);
  const items = await db
    .select({
      id: schema.feedbackItems.id,
      type: schema.feedbackItems.type,
      status: schema.feedbackItems.status,
      rating: schema.feedbackItems.rating,
      title: schema.feedbackItems.title,
      body: schema.feedbackItems.body,
      voteCount: schema.feedbackItems.voteCount,
      externalUserDisplay: schema.feedbackItems.externalUserDisplay,
      metadata: schema.feedbackItems.metadata,
      createdAt: schema.feedbackItems.createdAt,
    })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.appId, layout.app.id))
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(200);

  return { ...layout, items };
};
