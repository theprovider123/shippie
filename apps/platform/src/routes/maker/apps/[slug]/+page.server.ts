/**
 * Maker app Home — calm health view.
 *
 * This page deliberately computes health from live source tables. The
 * denormalized counter columns are not maintained, so Home must never read
 * them.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { CAPABILITY_BADGES, type CapabilityBadge } from '$server/proof/taxonomy';
import {
  OPEN_EVENTS,
  proofSummary,
  toFeedbackPreview,
  zeroFillOpens,
  type OpensDay,
} from '$server/maker/app-health';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  const emptyHealth = {
    metrics: {
      opens: 0,
      favorites: layout.app.upvoteCount,
      feedbackOpen: 0,
      events: 0,
    },
    opensByDay: zeroFillOpens([]),
    latestEvent: null as { eventName: string; createdAt: string } | null,
    topFeedback: [],
    lineage: null as { sourceRepo: string | null; license: string | null; remixAllowed: boolean } | null,
    proof: proofSummary({ earnedBadges: [], proofEventCount: 0, totalBadges: CAPABILITY_BADGES.length }),
  };

  if (!platform?.env.DB) return { ...layout, health: emptyHealth };

  const db = getDrizzleClient(platform.env.DB);
  const openEvents = [...OPEN_EVENTS];

  const [opensRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.analyticsEvents)
    .where(and(eq(schema.analyticsEvents.appId, layout.app.id), inArray(schema.analyticsEvents.eventName, openEvents)));

  const dayExpr = sql<string>`date(${schema.analyticsEvents.createdAt})`;
  const opensByDayRows = await db
    .select({
      date: dayExpr,
      opens: sql<number>`count(*)`,
    })
    .from(schema.analyticsEvents)
    .where(
      and(
        eq(schema.analyticsEvents.appId, layout.app.id),
        inArray(schema.analyticsEvents.eventName, openEvents),
        sql`date(${schema.analyticsEvents.createdAt}) >= date('now', '-29 day')`,
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  const [eventsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.appId, layout.app.id));

  const [latestEvent] = await db
    .select({
      eventName: schema.analyticsEvents.eventName,
      createdAt: schema.analyticsEvents.createdAt,
    })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.appId, layout.app.id))
    .orderBy(desc(schema.analyticsEvents.createdAt))
    .limit(1);

  const [feedbackOpenRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.feedbackItems)
    .where(and(eq(schema.feedbackItems.appId, layout.app.id), eq(schema.feedbackItems.status, 'open')));

  const topFeedbackRows = await db
    .select({
      id: schema.feedbackItems.id,
      type: schema.feedbackItems.type,
      title: schema.feedbackItems.title,
      body: schema.feedbackItems.body,
      voteCount: schema.feedbackItems.voteCount,
      createdAt: schema.feedbackItems.createdAt,
    })
    .from(schema.feedbackItems)
    .where(and(eq(schema.feedbackItems.appId, layout.app.id), eq(schema.feedbackItems.status, 'open')))
    .orderBy(desc(schema.feedbackItems.voteCount), desc(schema.feedbackItems.createdAt), desc(schema.feedbackItems.id))
    .limit(3);

  const [lineage] = await db
    .select({
      sourceRepo: schema.appLineage.sourceRepo,
      license: schema.appLineage.license,
      remixAllowed: schema.appLineage.remixAllowed,
    })
    .from(schema.appLineage)
    .where(eq(schema.appLineage.appId, layout.app.id))
    .limit(1);

  const earnedBadges = await db
    .select({ badge: schema.capabilityBadges.badge })
    .from(schema.capabilityBadges)
    .where(eq(schema.capabilityBadges.appId, layout.app.id));

  const [proofEventRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.proofEvents)
    .where(eq(schema.proofEvents.appId, layout.app.id));

  return {
    ...layout,
    health: {
      metrics: {
        opens: Number(opensRow?.count ?? 0),
        favorites: layout.app.upvoteCount,
        feedbackOpen: Number(feedbackOpenRow?.count ?? 0),
        events: Number(eventsRow?.count ?? 0),
      },
      opensByDay: zeroFillOpens(
        opensByDayRows.map((row) => ({ date: row.date, opens: Number(row.opens) })) satisfies OpensDay[],
      ),
      latestEvent: latestEvent ?? null,
      topFeedback: toFeedbackPreview(topFeedbackRows),
      lineage: lineage ?? null,
      proof: proofSummary({
        earnedBadges: earnedBadges.map((row) => row.badge as CapabilityBadge),
        proofEventCount: Number(proofEventRow?.count ?? 0),
        totalBadges: CAPABILITY_BADGES.length,
      }),
    },
  };
};
