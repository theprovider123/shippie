/**
 * POST /api/apps/[slug]/rate
 *
 * Upsert a rating (1..5) + optional review text for the signed-in user.
 */
import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'database unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const rating = typeof body.rating === 'number' ? body.rating : NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: 'invalid_rating' }, { status: 400 });
  }
  const review =
    typeof body.review === 'string' && body.review.trim().length > 0
      ? body.review.trim().slice(0, 2000)
      : null;

  const slug = event.params.slug!;
  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return json({ error: 'not_found' }, { status: 404 });

  const now = new Date().toISOString();
  await db
    .insert(schema.appRatings)
    .values({ appId: app.id, userId: who.userId, rating, review, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.appRatings.appId, schema.appRatings.userId],
      set: { rating, review, updatedAt: now },
    });

  // Quiet ESLint about unused `sql` if any later refactor.
  void sql;

  return json({ ok: true });
};
