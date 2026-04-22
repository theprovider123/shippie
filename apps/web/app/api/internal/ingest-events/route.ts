// apps/web/app/api/internal/ingest-events/route.ts
/**
 * Platform-side event ingestion — the worker posts batched wrapper
 * events here after signing with the shared WORKER_PLATFORM_SECRET.
 *
 * Each entry is persisted to the partitioned `app_events` spine table
 * (see migration 0015); retention trims old partitions and the hourly
 * rollup cron consumes these rows into `usage_daily`.
 *
 * Body shape:
 *   { slug, events: [ { event_type, session_id, user_id?, metadata?, ts? } ] }
 *
 * Returns 204 on success, 400 on malformed input, 401 on unsigned.
 */
import { type NextRequest } from 'next/server';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_EVENTS = 200;

interface RawBody {
  slug?: unknown;
  events?: unknown;
}

interface RawEvent {
  event_type?: unknown;
  session_id?: unknown;
  user_id?: unknown;
  metadata?: unknown;
  ts?: unknown;
}

interface NormalizedEvent {
  appId: string;
  sessionId: string;
  userId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
  ts: Date;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseTs(raw: unknown): Date {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function normalizeEvent(slug: string, e: RawEvent): NormalizedEvent | null {
  if (typeof e.event_type !== 'string' || e.event_type.length === 0) return null;
  if (typeof e.session_id !== 'string' || e.session_id.length === 0) return null;
  const userId = typeof e.user_id === 'string' && e.user_id.length > 0 ? e.user_id : null;
  const metadata =
    e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata)
      ? (e.metadata as Record<string, unknown>)
      : {};
  return {
    appId: slug,
    sessionId: e.session_id,
    userId,
    eventType: e.event_type,
    metadata,
    ts: parseTs(e.ts),
  };
}

export const POST = withLogger('shippie.internal.ingest-events', async (req: NextRequest) => {
  const raw = await req.text();
  try {
    await verifyInternalRequest(req, raw);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'unauthorized', message: (err as Error).message }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  let body: RawBody;
  try {
    body = JSON.parse(raw) as RawBody;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const slug = typeof body.slug === 'string' && body.slug.length > 0 ? body.slug : null;
  if (!slug) return jsonError(400, 'missing_slug');

  if (!Array.isArray(body.events)) return jsonError(400, 'events_not_array');
  if (body.events.length === 0) {
    return new Response(null, { status: 204 });
  }
  if (body.events.length > MAX_EVENTS) return jsonError(400, 'events_too_many');

  const normalized: NormalizedEvent[] = [];
  for (const e of body.events as RawEvent[]) {
    const n = normalizeEvent(slug, e);
    if (!n) return jsonError(400, 'invalid_event');
    normalized.push(n);
  }

  const db = await getDb();
  await db.insert(schema.appEvents).values(normalized);

  return new Response(null, { status: 204 });
});
