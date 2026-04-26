/**
 * Daily capability-badges rollup.
 *
 * For every active app, count distinct device hashes per proof event type
 * within each badge rule's lookback window. If every event the rule
 * requires is observed from ≥ threshold distinct devices, award the badge.
 * Otherwise, revoke any prior award (the badge reflects current truth,
 * not historical truth — apps that regress lose their badges).
 *
 * Idempotent: re-running for the same day re-derives the same set.
 *
 * Wired into the daily 4am cron alongside `retention`.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import {
  BADGE_RULES,
  CAPABILITY_BADGES,
  type CapabilityBadge,
  type ProofEventType,
} from '../proof/taxonomy';
import type { D1Database } from '@cloudflare/workers-types';

export interface CapabilityBadgesEnv {
  DB: D1Database;
}

export interface CapabilityBadgesResult {
  appsScanned: number;
  badgesAwarded: number;
  badgesRevoked: number;
}

/**
 * Pure helper — given device-hash sets per event type, return the badges
 * the app currently qualifies for. Exposed for unit tests.
 */
export function deriveBadges(
  perEventDeviceCounts: Record<ProofEventType, number>,
): { badge: CapabilityBadge; minDistinctDevices: number }[] {
  const awarded: { badge: CapabilityBadge; minDistinctDevices: number }[] = [];
  for (const badge of CAPABILITY_BADGES) {
    const rule = BADGE_RULES[badge];
    let minSeen = Number.POSITIVE_INFINITY;
    let allEventsMet = true;
    for (const eventType of rule.events) {
      const count = perEventDeviceCounts[eventType] ?? 0;
      if (count < rule.threshold) {
        allEventsMet = false;
        break;
      }
      if (count < minSeen) minSeen = count;
    }
    if (allEventsMet && minSeen !== Number.POSITIVE_INFINITY) {
      awarded.push({ badge, minDistinctDevices: minSeen });
    }
  }
  return awarded;
}

function windowCutoffIso(windowDays: number): string {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

export async function capabilityBadges(env: CapabilityBadgesEnv): Promise<CapabilityBadgesResult> {
  const db = getDrizzleClient(env.DB);

  // Take the longest window from any badge rule. Rules with shorter
  // windows just throw away the older rows after we filter per rule below.
  const longestWindow = Math.max(...CAPABILITY_BADGES.map((b) => BADGE_RULES[b].windowDays));
  const cutoff = windowCutoffIso(longestWindow);

  // Pull the bucket of (appId, eventType, deviceHash, ts) for the window.
  // For typical apps this is at most a few hundred rows. If it grows we
  // can move to per-app pagination.
  const rows = await db
    .select({
      appId: schema.proofEvents.appId,
      eventType: schema.proofEvents.eventType,
      deviceHash: schema.proofEvents.deviceHash,
      ts: schema.proofEvents.ts,
    })
    .from(schema.proofEvents)
    .where(gte(schema.proofEvents.ts, cutoff));

  // Bucket: appId → eventType → Set<deviceHash> filtered per badge rule's
  // own window when we derive.
  const byApp = new Map<string, Map<string, Set<string>>>();
  const tsByApp = new Map<string, Map<string, Map<string, string>>>(); // appId → eventType → device → mostRecentTs
  for (const row of rows) {
    let appBucket = byApp.get(row.appId);
    if (!appBucket) {
      appBucket = new Map();
      byApp.set(row.appId, appBucket);
    }
    let typeBucket = appBucket.get(row.eventType);
    if (!typeBucket) {
      typeBucket = new Set();
      appBucket.set(row.eventType, typeBucket);
    }
    typeBucket.add(row.deviceHash);

    let appTs = tsByApp.get(row.appId);
    if (!appTs) {
      appTs = new Map();
      tsByApp.set(row.appId, appTs);
    }
    let typeTs = appTs.get(row.eventType);
    if (!typeTs) {
      typeTs = new Map();
      appTs.set(row.eventType, typeTs);
    }
    const prev = typeTs.get(row.deviceHash);
    if (!prev || row.ts > prev) typeTs.set(row.deviceHash, row.ts);
  }

  let awardedCount = 0;
  let revokedCount = 0;

  for (const [appId, eventBuckets] of byApp) {
    // Per-badge: filter the device set to entries within that badge's
    // window before counting.
    const perEventDeviceCounts: Partial<Record<ProofEventType, number>> = {};
    for (const badge of CAPABILITY_BADGES) {
      const rule = BADGE_RULES[badge];
      const ruleCutoff = windowCutoffIso(rule.windowDays);
      for (const eventType of rule.events) {
        // Only recompute if not already computed for this event under
        // a stricter (larger) window — but cheaper to recompute than
        // memoise here.
        const allDevices = eventBuckets.get(eventType);
        if (!allDevices) {
          perEventDeviceCounts[eventType] = 0;
          continue;
        }
        const tsForEvent = tsByApp.get(appId)?.get(eventType);
        let count = 0;
        for (const device of allDevices) {
          const ts = tsForEvent?.get(device);
          if (ts && ts >= ruleCutoff) count += 1;
        }
        perEventDeviceCounts[eventType] = count;
      }
    }

    const earned = deriveBadges(perEventDeviceCounts as Record<ProofEventType, number>);
    const earnedSet = new Set(earned.map((e) => e.badge));

    // Read prior awards.
    const prior = await db
      .select({ badge: schema.capabilityBadges.badge })
      .from(schema.capabilityBadges)
      .where(eq(schema.capabilityBadges.appId, appId));
    const priorSet = new Set(prior.map((p) => p.badge));

    // Revoke any prior badges we no longer qualify for.
    for (const priorBadge of priorSet) {
      if (!earnedSet.has(priorBadge as CapabilityBadge)) {
        await db
          .delete(schema.capabilityBadges)
          .where(
            and(
              eq(schema.capabilityBadges.appId, appId),
              eq(schema.capabilityBadges.badge, priorBadge),
            ),
          );
        revokedCount += 1;
      }
    }

    // Upsert current awards.
    if (earned.length > 0) {
      const now = new Date().toISOString();
      for (const { badge, minDistinctDevices } of earned) {
        try {
          await db
            .insert(schema.capabilityBadges)
            .values({
              appId,
              badge,
              awardedAt: now,
              distinctDevices: minDistinctDevices,
            })
            .onConflictDoUpdate({
              target: [schema.capabilityBadges.appId, schema.capabilityBadges.badge],
              set: { distinctDevices: sql`excluded.distinct_devices` },
            });
          if (!priorSet.has(badge)) awardedCount += 1;
        } catch (err) {
          console.error('[cron:capability-badges] upsert failed', { appId, badge, err });
        }
      }
    }
  }

  console.log(
    `[cron:capability-badges] apps=${byApp.size} awarded=${awardedCount} revoked=${revokedCount}`,
  );
  return { appsScanned: byApp.size, badgesAwarded: awardedCount, badgesRevoked: revokedCount };
}
