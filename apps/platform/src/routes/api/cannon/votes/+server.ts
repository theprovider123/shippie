/**
 * POST /api/cannon/votes {takeId,anonKey,dir:'up'|'down'|null} -> {up,down,myVote}
 *
 * One vote per anonymous key per take; posting the same direction again is a
 * no-op at the client (it sends null to clear), the opposite direction flips.
 * Counters on cannon_takes are baselines plus deltas — seeded takes carry
 * launch counts with no cannon_votes rows, so counters are never recomputed
 * from the votes table, only nudged by the delta of this voter's change.
 */
import { json } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import { cors, isValidAnonKey } from '$lib/server/cannon';

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  if (!db) return json({ error: 'unavailable' }, { status: 503, headers: cors });

  let body: { takeId?: unknown; anonKey?: unknown; dir?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, { status: 400, headers: cors });
  }

  const { takeId, anonKey, dir } = body;
  if (typeof takeId !== 'string' || takeId.length === 0 || takeId.length > 64) {
    return json({ error: 'invalid-take' }, { status: 400, headers: cors });
  }
  if (!isValidAnonKey(anonKey)) {
    return json({ error: 'invalid-anon-key' }, { status: 400, headers: cors });
  }
  if (dir !== 'up' && dir !== 'down' && dir !== null) {
    return json({ error: 'invalid-dir' }, { status: 400, headers: cors });
  }

  const take = await db
    .prepare('SELECT id, status FROM cannon_takes WHERE id = ?1')
    .bind(takeId)
    .first<{ id: string; status: string }>();
  // Hidden/removed takes are not voteable — same 404 as missing so the
  // moderation state never leaks through the public surface.
  if (!take || take.status !== 'visible') {
    return json({ error: 'not-found' }, { status: 404, headers: cors });
  }

  const existing = await db
    .prepare('SELECT dir FROM cannon_votes WHERE take_id = ?1 AND anon_key = ?2')
    .bind(takeId, anonKey)
    .first<{ dir: number }>();

  const prev = existing ? (existing.dir === 1 ? 'up' : 'down') : null;
  if (prev === dir) {
    // Idempotent: same state requested, nothing to change.
    const row = await db
      .prepare('SELECT up, down FROM cannon_takes WHERE id = ?1')
      .bind(takeId)
      .first<{ up: number; down: number }>();
    return json({ up: row?.up ?? 0, down: row?.down ?? 0, myVote: dir }, { headers: cors });
  }

  const dUp = (dir === 'up' ? 1 : 0) - (prev === 'up' ? 1 : 0);
  const dDown = (dir === 'down' ? 1 : 0) - (prev === 'down' ? 1 : 0);

  const writes = [
    dir === null
      ? db
          .prepare('DELETE FROM cannon_votes WHERE take_id = ?1 AND anon_key = ?2')
          .bind(takeId, anonKey)
      : db
          .prepare(
            'INSERT INTO cannon_votes (take_id, anon_key, dir, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (take_id, anon_key) DO UPDATE SET dir = excluded.dir, created_at = excluded.created_at',
          )
          .bind(takeId, anonKey, dir === 'up' ? 1 : -1, Date.now()),
    db
      .prepare(
        'UPDATE cannon_takes SET up = MAX(0, up + ?2), down = MAX(0, down + ?3) WHERE id = ?1',
      )
      .bind(takeId, dUp, dDown),
  ];
  await db.batch(writes);

  const row = await db
    .prepare('SELECT up, down FROM cannon_takes WHERE id = ?1')
    .bind(takeId)
    .first<{ up: number; down: number }>();

  return json({ up: row?.up ?? 0, down: row?.down ?? 0, myVote: dir }, { headers: cors });
};
