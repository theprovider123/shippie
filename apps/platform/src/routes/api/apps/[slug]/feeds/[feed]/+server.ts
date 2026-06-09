/**
 * Feed Protocol endpoint (lane 3: silent data refresh).
 *
 *   GET  /api/apps/:slug/feeds/:feed         → latest feed envelope (public, cacheable).
 *        ?since=N                            → { changed:false, sequence } when N ≥ sequence.
 *   POST /api/apps/:slug/feeds/:feed         → publish a snapshot (admin-gated in Phase 1).
 *
 * App-owner publishing and per-app ingest tokens are Phase 2 (see the spec). Writes are locked to
 * platform admins for now — the conservative launch-safe default for a brand-new capability.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$lib/server/auth/resolve-user';
import { getLatestFeed, publishFeed } from '$lib/server/feeds/store';
import { hasChanged } from '$lib/server/feeds/envelope';
import { validateFeedPayload } from '$lib/server/feeds/schemas';

const CACHE = 'public, max-age=15, stale-while-revalidate=60';
// Public, read-only data — safe to read from any showcase origin (apps may run on subdomains).
const READ_HEADERS = { 'cache-control': CACHE, 'access-control-allow-origin': '*' };

export const OPTIONS: RequestHandler = async () =>
  new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });

export const GET: RequestHandler = async ({ params, url, platform }) => {
  const db = platform?.env.DB;
  if (!db) return json({ error: 'database_unavailable' }, { status: 500, headers: { 'access-control-allow-origin': '*' } });

  // Gate on app visibility and suspension before exposing feed data.
  // Archived apps (including admin-suspended) and non-public apps return 404
  // so as not to leak private data through the world-readable CORS endpoint.
  const app = await db
    .prepare('SELECT is_archived, visibility_scope FROM apps WHERE slug = ? LIMIT 1')
    .bind(params.slug)
    .first<{ is_archived: number; visibility_scope: string }>();
  if (!app || app.is_archived || app.visibility_scope === 'private' || app.visibility_scope === 'team') {
    return json({ error: 'no_feed' }, { status: 404, headers: { 'access-control-allow-origin': '*' } });
  }

  const envelope = await getLatestFeed(db, params.slug, params.feed);
  if (!envelope) return json({ error: 'no_feed' }, { status: 404, headers: { 'access-control-allow-origin': '*' } });

  const sinceRaw = url.searchParams.get('since');
  if (sinceRaw != null) {
    const since = Number(sinceRaw);
    if (!hasChanged(envelope, since)) {
      return json({ changed: false, sequence: envelope.sequence }, { headers: READ_HEADERS });
    }
  }
  return json(envelope, { headers: READ_HEADERS });
};

export const POST: RequestHandler = async (event) => {
  const { params, request, platform } = event;
  const db = platform?.env.DB;
  if (!db) return json({ error: 'database_unavailable' }, { status: 500 });

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  // Phase 1: publishing is admin-only.
  const admin = await db
    .prepare('SELECT is_admin FROM users WHERE id = ? LIMIT 1')
    .bind(who.userId)
    .first<{ is_admin: number }>();
  if (!admin?.is_admin) return json({ error: 'forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 });
  const { dataSchema, payload, staleAfter, source } = body as Record<string, unknown>;

  if (typeof dataSchema !== 'string' || !dataSchema) {
    return json({ error: 'dataSchema_required' }, { status: 400 });
  }
  const errors = validateFeedPayload(dataSchema, payload);
  if (errors.length) return json({ error: 'invalid_payload', details: errors }, { status: 400 });

  const nowMs = Date.now();
  const result = await publishFeed(db, {
    appSlug: params.slug,
    feedId: params.feed,
    dataSchema,
    payload,
    staleAfter: typeof staleAfter === 'string' ? staleAfter : undefined,
    source: isSource(source) ? source : { kind: 'manual' },
    updatedAt: new Date(nowMs).toISOString(),
    nowMs,
  });

  return json({ ok: true, changed: result.changed, envelope: result.envelope });
};

function isSource(v: unknown): v is { kind: 'external-api' | 'maker-upload' | 'manual'; name?: string } {
  return (
    Boolean(v) &&
    typeof v === 'object' &&
    ['external-api', 'maker-upload', 'manual'].includes(String((v as Record<string, unknown>).kind))
  );
}
