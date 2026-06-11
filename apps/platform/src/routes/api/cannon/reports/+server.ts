/**
 * POST /api/cannon/reports {takeId, anonKey, reason} -> { ok, hidden }
 *
 * The Terrace report path. One report per anonymous key per take
 * (INSERT OR IGNORE); when distinct reporters reach REPORT_HIDE_THRESHOLD the
 * take auto-hides pending review — it stops being served, voteable, or
 * repliable, but is never deleted (an admin can restore or remove it).
 */
import { json } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import {
  REPORT_HIDE_THRESHOLD,
  REPORT_REASONS,
  cors,
  isValidAnonKey,
} from '$lib/server/cannon';

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  if (!db) return json({ error: 'unavailable' }, { status: 503, headers: cors });

  let body: { takeId?: unknown; anonKey?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, { status: 400, headers: cors });
  }

  const { takeId, anonKey, reason } = body;
  if (typeof takeId !== 'string' || takeId.length === 0 || takeId.length > 64) {
    return json({ error: 'invalid-take' }, { status: 400, headers: cors });
  }
  if (!isValidAnonKey(anonKey)) {
    return json({ error: 'invalid-anon-key' }, { status: 400, headers: cors });
  }
  if (typeof reason !== 'string' || !REPORT_REASONS.has(reason)) {
    return json({ error: 'invalid-reason' }, { status: 400, headers: cors });
  }

  const take = await db
    .prepare('SELECT id, status FROM cannon_takes WHERE id = ?1')
    .bind(takeId)
    .first<{ id: string; status: string }>();
  if (!take || take.status === 'removed') {
    return json({ error: 'not-found' }, { status: 404, headers: cors });
  }

  await db
    .prepare(
      'INSERT OR IGNORE INTO cannon_reports (take_id, anon_key, reason, created_at) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(takeId, anonKey, reason, Date.now())
    .run();

  const count = await db
    .prepare('SELECT COUNT(*) AS n FROM cannon_reports WHERE take_id = ?1')
    .bind(takeId)
    .first<{ n: number }>();
  const reports = count?.n ?? 0;

  const shouldHide = reports >= REPORT_HIDE_THRESHOLD && take.status === 'visible';
  await db
    .prepare(
      shouldHide
        ? "UPDATE cannon_takes SET report_count = ?2, status = 'hidden' WHERE id = ?1"
        : 'UPDATE cannon_takes SET report_count = ?2 WHERE id = ?1',
    )
    .bind(takeId, reports)
    .run();

  return json({ ok: true, hidden: shouldHide || take.status === 'hidden' }, { headers: cors });
};
