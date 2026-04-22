// apps/web/app/api/internal/retention/route.ts
/**
 * /api/internal/retention — daily cron.
 *
 * Drops `app_events_<YYYY_MM>` partitions older than 2 calendar months.
 * O(1) delete vs. O(N) row scan — this is the whole point of the
 * partitioned spine (see migration 0015).
 *
 * Safety:
 *   - Auth via authorizeCron (CRON_SECRET / SHIPPIE_INTERNAL_CRON_TOKEN).
 *   - The partition name is *constructed* from validated year/month
 *     integers, never taken from request input. `DROP TABLE IF EXISTS`
 *     is wrapped in sql.raw() but the interpolated string matches an
 *     exact regex prefix.
 *   - An optional `?today=YYYY-MM-DD` param lets tests and manual runs
 *     pin the reference date; production cron omits it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { authorizeCron } from '@/lib/internal/cron-auth';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PARTITION_NAME_RE = /^app_events_\d{4}_\d{2}$/;

function parseToday(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map((s) => Number.parseInt(s, 10));
    return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
  }
  return new Date();
}

function targetPartitionName(today: Date): string {
  // Two calendar months before today's year/month. E.g. today 2026-04-21
  // → target 2026-02.
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1; // 1..12
  let targetYear = y;
  let targetMonth = m - 2;
  if (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }
  const mm = String(targetMonth).padStart(2, '0');
  return `app_events_${targetYear}_${mm}`;
}

async function run(req: NextRequest): Promise<Response> {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const today = parseToday(url.searchParams.get('today'));
  const name = targetPartitionName(today);

  if (!PARTITION_NAME_RE.test(name)) {
    // Paranoia — the generator is deterministic and always valid, but
    // if future code drift ever produced a bad name we refuse to drop.
    return NextResponse.json({ error: 'invalid_partition_name' }, { status: 500 });
  }

  const db = await getDb();
  await db.execute(sql.raw(`DROP TABLE IF EXISTS ${name}`));

  return NextResponse.json({ ok: true, dropped: [name], today: today.toISOString() });
}

export const GET = withLogger('internal.retention', run);
export const POST = withLogger('internal.retention', run);
