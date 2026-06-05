/**
 * GET /api/feedback/mine?ids=a,b,c
 *
 * Capability-based read of feedback by id — you only get rows whose (random
 * UUID) ids you already hold, which the on-device store stashes at submit time.
 * Lets an anonymous user see the status + maker reply on feedback they sent,
 * without an account. Returns only the user-safe view (no moderation flags, no
 * identity, status mapped so `spam`/`reviewing` never leak).
 */
import type { RequestHandler } from './$types';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { toUserFeedbackView } from '$lib/feedback/history';

export const GET: RequestHandler = async ({ url, platform }) => {
  if (!platform?.env.DB) return Response.json({ items: [] });

  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (ids.length === 0) return Response.json({ items: [] });

  const db = getDrizzleClient(platform.env.DB);
  const rows = await db
    .select({
      id: schema.feedbackItems.id,
      appSlug: schema.apps.slug,
      appName: schema.apps.name,
      type: schema.feedbackItems.type,
      title: schema.feedbackItems.title,
      body: schema.feedbackItems.body,
      status: schema.feedbackItems.status,
      makerReply: schema.feedbackItems.makerReply,
      makerReplyAt: schema.feedbackItems.makerReplyAt,
      createdAt: schema.feedbackItems.createdAt,
    })
    .from(schema.feedbackItems)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.feedbackItems.appId))
    .where(inArray(schema.feedbackItems.id, ids))
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(100);

  return Response.json({ items: rows.map(toUserFeedbackView) });
};
