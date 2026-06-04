import { desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const { app } = await parent();

  if (!platform?.env.DB) {
    return {
      analytics: {
        total: 0,
        latest: null,
        recent: [],
        health: 'unavailable' as const,
      },
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.appId, app.id));

  const recent = await db
    .select({
      eventName: schema.analyticsEvents.eventName,
      createdAt: schema.analyticsEvents.createdAt,
      url: schema.analyticsEvents.url,
      sessionId: schema.analyticsEvents.sessionId,
    })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.appId, app.id))
    .orderBy(desc(schema.analyticsEvents.createdAt))
    .limit(8);

  return {
    analytics: {
      total: Number(totalRow?.count ?? 0),
      latest: recent[0] ?? null,
      recent,
      health: recent.length > 0 ? ('receiving' as const) : ('waiting' as const),
    },
  };
};
