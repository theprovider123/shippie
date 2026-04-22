// apps/web/app/api/internal/rollups/route.ts
/**
 * /api/internal/rollups — hourly cron.
 *
 * Reads yesterday's slice of `app_events` (UTC), runs the pure
 * aggregator, and upserts one `usage_daily` row per distinct
 * (app_id, event_type) pair with an ON CONFLICT DO UPDATE that
 * replaces the prior count.
 *
 * Auth: see lib/internal/cron-auth.ts — CRON_SECRET or
 * SHIPPIE_INTERNAL_CRON_TOKEN. Tests pass the token directly; Vercel's
 * managed cron handles the same header automatically.
 *
 * Accepts an optional `?day=YYYY-MM-DD` query param so backfills and
 * integration tests can target a specific UTC bucket. In production
 * the cron omits it and we default to "yesterday".
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, gte, lt, sql } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { authorizeCron } from '@/lib/internal/cron-auth';
import { withLogger } from '@/lib/observability/logger';
import { aggregate, type RawEvent } from '@/lib/shippie/rollups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDayParam(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map((s) => Number.parseInt(s, 10));
    return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
  }
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0),
  );
}

async function run(req: NextRequest): Promise<Response> {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const day = parseDayParam(url.searchParams.get('day'));
  const dayEnd = new Date(day.getTime() + MS_PER_DAY);

  const db = await getDb();
  const rows = await db
    .select({
      appId: schema.appEvents.appId,
      eventType: schema.appEvents.eventType,
      ts: schema.appEvents.ts,
    })
    .from(schema.appEvents)
    .where(and(gte(schema.appEvents.ts, day), lt(schema.appEvents.ts, dayEnd)));

  const raw: RawEvent[] = rows.map((r) => ({
    appId: r.appId,
    eventType: r.eventType,
    ts: r.ts,
  }));
  const rollups = aggregate(raw, day);

  if (rollups.length > 0) {
    await db
      .insert(schema.usageDaily)
      .values(
        rollups.map((r) => ({
          appId: r.appId,
          day: r.day,
          eventType: r.eventType,
          count: r.count,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.usageDaily.appId, schema.usageDaily.day, schema.usageDaily.eventType],
        set: {
          count: sql`excluded.count`,
        },
      });
  }

  const apps = new Set(rollups.map((r) => r.appId)).size;
  return NextResponse.json({
    ok: true,
    rolled_up: rollups.length,
    apps,
    day: day.toISOString(),
  });
}

export const GET = withLogger('internal.rollups', run);
export const POST = withLogger('internal.rollups', run);
