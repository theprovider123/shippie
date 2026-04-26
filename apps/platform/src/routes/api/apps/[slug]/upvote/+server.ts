/**
 * POST /api/apps/[slug]/upvote
 *
 * Toggle upvote for the signed-in user on an app. Stored as an
 * `app_events` row with `event_type = 'upvote'`. Re-posting toggles off
 * (the existing row gets soft-deleted via a follow-up `un_upvote` event
 * that the rollup ignores).
 *
 * Body: none. Returns:
 *   { success: true, upvoted: boolean, count: number }
 *
 * Phase 4a's UpvoteButton calls into here.
 */
import { json, error } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'database unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const slug = event.params.slug!;
  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({ id: schema.apps.id, upvoteCount: schema.apps.upvoteCount })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return json({ error: 'not_found' }, { status: 404 });

  // Determine current state from latest upvote/un_upvote event for this user.
  const recent = await db
    .select({ eventType: schema.appEvents.eventType })
    .from(schema.appEvents)
    .where(
      and(
        eq(schema.appEvents.appId, app.id),
        eq(schema.appEvents.userId, who.userId),
        sql`${schema.appEvents.eventType} IN ('upvote', 'un_upvote')`,
      ),
    )
    .orderBy(desc(schema.appEvents.ts))
    .limit(1);

  const currentlyUpvoted = recent[0]?.eventType === 'upvote';
  const next = !currentlyUpvoted;

  // Insert toggle event. session_id = userId for non-wrapper-emitted events.
  const id = await nextEventId(env.DB);
  await env.DB
    .prepare(
      `INSERT INTO app_events (id, app_id, session_id, user_id, event_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, app.id, who.userId, who.userId, next ? 'upvote' : 'un_upvote', '{}')
    .run();

  // Maintain the denormalized counter on apps.
  const delta = next ? 1 : -1;
  await db
    .update(schema.apps)
    .set({
      upvoteCount: sql`${schema.apps.upvoteCount} + ${delta}`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.apps.id, app.id));

  return json({
    success: true,
    upvoted: next,
    count: app.upvoteCount + delta,
  });
};

/**
 * D1 has no AUTOINCREMENT — `app_events.id` is INTEGER PRIMARY KEY but
 * the migration uses a composite (id, ts) PK so we can't rely on rowid
 * fall-through. Pick max+1; not race-safe at scale but adequate for an
 * upvote toggle (idempotent on retry).
 */
async function nextEventId(db: import('@cloudflare/workers-types').D1Database): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(MAX(id), 0) AS max FROM app_events').first<{ max: number }>();
  return (row?.max ?? 0) + 1;
}
