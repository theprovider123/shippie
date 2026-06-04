/**
 * Proof tab — earned Capability Proof Badges + pending badges with
 * per-event progress against threshold.
 *
 * Reads `proof_events` and `capability_badges` for the maker's app.
 * Pure read — no actions; the only writes are by the daily
 * capability-badges cron.
 */
import { error, redirect } from '@sveltejs/kit';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import {
  BADGE_RULES,
  CAPABILITY_BADGES,
  type CapabilityBadge,
  type ProofEventType,
} from '$server/proof/taxonomy';

interface BadgeStatus {
  badge: CapabilityBadge;
  description: string;
  earned: boolean;
  awardedAt: string | null;
  distinctDevices: number;
  threshold: number;
  windowDays: number;
  /** Per-event device counts (only for events the badge depends on). */
  events: { eventType: ProofEventType; distinctDevices: number; pct: number }[];
}

export const load: PageServerLoad = async ({ params, parent, platform, url }) => {
  const data = await parent();
  if (!data?.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
  }
  if (!platform?.env.DB) throw error(500, 'database unavailable');
  const db = getDrizzleClient(platform.env.DB);

  const [app] = await db
    .select({ id: schema.apps.id, slug: schema.apps.slug, name: schema.apps.name, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, params.slug!))
    .limit(1);
  if (!app) throw error(404, 'app not found');
  if (app.makerId !== data.user.id) throw error(403, 'forbidden');

  // Awarded badges (could be empty — cron hasn't run yet on a fresh app).
  const awarded = await db
    .select({
      badge: schema.capabilityBadges.badge,
      awardedAt: schema.capabilityBadges.awardedAt,
      distinctDevices: schema.capabilityBadges.distinctDevices,
    })
    .from(schema.capabilityBadges)
    .where(eq(schema.capabilityBadges.appId, app.id));
  const awardedByBadge = new Map(awarded.map((a) => [a.badge as CapabilityBadge, a]));

  // For each badge, derive the *current* per-event device counts so we can
  // show pending progress. We use the longest window so the dashboard data
  // is fresh — per-rule windows are then enforced when computing pct.
  const longestWindow = Math.max(...CAPABILITY_BADGES.map((b) => BADGE_RULES[b].windowDays));
  const cutoffLong = new Date(Date.now() - longestWindow * 24 * 60 * 60 * 1000).toISOString();

  // Distinct devices per (eventType) within the longest window.
  const perEvent = await db
    .select({
      eventType: schema.proofEvents.eventType,
      distinctDevices: sql<number>`count(distinct ${schema.proofEvents.deviceHash})`,
    })
    .from(schema.proofEvents)
    .where(and(eq(schema.proofEvents.appId, app.id), gte(schema.proofEvents.ts, cutoffLong)))
    .groupBy(schema.proofEvents.eventType);
  const perEventCount = new Map<string, number>();
  for (const row of perEvent) perEventCount.set(row.eventType, Number(row.distinctDevices));

  const badges: BadgeStatus[] = CAPABILITY_BADGES.map((badge) => {
    const rule = BADGE_RULES[badge];
    const award = awardedByBadge.get(badge);
    const events = rule.events.map((eventType) => {
      const count = perEventCount.get(eventType) ?? 0;
      const pct = Math.min(1, count / rule.threshold);
      return { eventType, distinctDevices: count, pct };
    });
    return {
      badge,
      description: rule.description,
      earned: !!award,
      awardedAt: award?.awardedAt ?? null,
      distinctDevices: award?.distinctDevices ?? 0,
      threshold: rule.threshold,
      windowDays: rule.windowDays,
      events,
    };
  });

  return {
    app: { slug: app.slug, name: app.name },
    badges,
  };
};
