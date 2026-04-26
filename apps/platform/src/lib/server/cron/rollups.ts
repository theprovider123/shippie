/**
 * rollups cron — runs hourly.
 *
 * Reads yesterday's rows from `analytics_events` (D1, single non-partitioned
 * table) and upserts one `(app_id, day, event_type, count)` row into
 * `usage_daily`. Idempotent: re-running the same day rewrites the count.
 *
 * Also rebuilds the `user_touch_graph` co-touch deltas for the same window.
 *
 * The aggregation logic is pulled out as a pure function so a unit test can
 * exercise it without D1.
 */
import { and, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import type { D1Database } from '@cloudflare/workers-types';

export interface RollupsEnv {
  DB: D1Database;
}

export interface RawEvent {
  appId: string;
  eventType: string;
  ts: string; // ISO string from D1 datetime column
}

export interface DailyRollup {
  appId: string;
  day: string; // 'YYYY-MM-DD'
  eventType: string;
  count: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC YYYY-MM-DD from a Date. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pure aggregator — exposed for tests. */
export function aggregate(events: RawEvent[], day: Date): DailyRollup[] {
  const dayIso = isoDay(day);
  const start = day.getTime();
  const end = start + MS_PER_DAY;

  const buckets = new Map<string, DailyRollup>();
  for (const ev of events) {
    const t = new Date(ev.ts).getTime();
    if (Number.isNaN(t) || t < start || t >= end) continue;
    const key = `${ev.appId}\x00${ev.eventType}`;
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { appId: ev.appId, day: dayIso, eventType: ev.eventType, count: 1 });
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.appId !== b.appId) return a.appId < b.appId ? -1 : 1;
    return a.eventType < b.eventType ? -1 : a.eventType > b.eventType ? 1 : 0;
  });
}

export interface RollupsResult {
  day: string;
  rolled_up: number;
  apps: number;
  pairs: number;
}

export async function rollups(env: RollupsEnv, opts?: { day?: Date }): Promise<RollupsResult> {
  const db = getDrizzleClient(env.DB);

  const now = opts?.day ?? new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0),
  );
  const dayEnd = new Date(day.getTime() + MS_PER_DAY);
  const dayStartIso = day.toISOString();
  const dayEndIso = dayEnd.toISOString();
  const dayIso = isoDay(day);

  let rolled = 0;
  let appCount = 0;
  let pairs = 0;

  try {
    const rows = await db
      .select({
        appId: schema.analyticsEvents.appId,
        eventType: schema.analyticsEvents.eventName,
        ts: schema.analyticsEvents.createdAt,
      })
      .from(schema.analyticsEvents)
      .where(
        and(
          gte(schema.analyticsEvents.createdAt, dayStartIso),
          lt(schema.analyticsEvents.createdAt, dayEndIso),
        ),
      );

    const raw: RawEvent[] = rows.map((r) => ({ appId: r.appId, eventType: r.eventType, ts: r.ts }));
    const aggregated = aggregate(raw, day);
    rolled = aggregated.length;
    appCount = new Set(aggregated.map((a) => a.appId)).size;

    if (aggregated.length > 0) {
      // Batch in pages of 100 to keep statement size reasonable.
      const pageSize = 100;
      for (let i = 0; i < aggregated.length; i += pageSize) {
        const slice = aggregated.slice(i, i + pageSize);
        try {
          await db
            .insert(schema.usageDaily)
            .values(slice.map((r) => ({ appId: r.appId, day: r.day, eventType: r.eventType, count: r.count })))
            .onConflictDoUpdate({
              target: [schema.usageDaily.appId, schema.usageDaily.day, schema.usageDaily.eventType],
              set: { count: sql`excluded.count` },
            });
        } catch (err) {
          console.error('[cron:rollups] upsert page failed', { offset: i, err });
        }
      }
    }

    // Co-touch graph: distinct (user, app) pairs for the window.
    const touches = await db
      .selectDistinct({
        appId: schema.analyticsEvents.appId,
        userId: schema.analyticsEvents.userId,
      })
      .from(schema.analyticsEvents)
      .where(
        and(
          gte(schema.analyticsEvents.createdAt, dayStartIso),
          lt(schema.analyticsEvents.createdAt, dayEndIso),
          isNotNull(schema.analyticsEvents.userId),
        ),
      );

    const userApps = new Map<string, Set<string>>();
    for (const t of touches) {
      if (!t.userId) continue;
      let set = userApps.get(t.userId);
      if (!set) {
        set = new Set();
        userApps.set(t.userId, set);
      }
      set.add(t.appId);
    }

    const pairCounts = new Map<string, number>();
    for (const apps of userApps.values()) {
      if (apps.size < 2) continue;
      const sorted = Array.from(apps).sort();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}\x00${sorted[j]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }
    pairs = pairCounts.size;
    const pairsNow = new Date().toISOString();
    for (const [key, delta] of pairCounts) {
      const [a, b] = key.split('\x00');
      if (!a || !b) continue;
      try {
        await db
          .insert(schema.userTouchGraph)
          .values({ appA: a, appB: b, users: delta, updatedAt: pairsNow })
          .onConflictDoUpdate({
            target: [schema.userTouchGraph.appA, schema.userTouchGraph.appB],
            set: {
              users: sql`${schema.userTouchGraph.users} + ${delta}`,
              updatedAt: pairsNow,
            },
          });
      } catch (err) {
        console.error('[cron:rollups] touch-graph upsert failed', { a, b, err });
      }
    }
  } catch (err) {
    console.error('[cron:rollups] window read failed', err);
  }

  console.log(`[cron:rollups] day=${dayIso} rolled_up=${rolled} apps=${appCount} pairs=${pairs}`);
  return { day: dayIso, rolled_up: rolled, apps: appCount, pairs };
}
