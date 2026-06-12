/**
 * GET  /api/cannon/predictions?match=…&anonKey=… -> {counts,total,confidence,mine}
 * POST /api/cannon/predictions {matchId,anonKey,pick:'W'|'D'|'L'|null} -> same
 *
 * Pre-match crowd prediction — the live fan-confidence bar. One pick per
 * anonymous key per match; posting null clears it. `confidence` is the share
 * of fans picking a win, rounded — the headline number on the Now screen.
 */
import { json } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import { PICKS, cors, isValidAnonKey, isValidMatchId } from '$lib/server/cannon';

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

type Pick = 'W' | 'D' | 'L';

async function summary(db: D1Database, matchId: string, anonKey: string | null) {
  const rows = (
    await db
      .prepare(
        'SELECT pick, COUNT(*) AS n FROM cannon_predictions WHERE match_id = ?1 GROUP BY pick',
      )
      .bind(matchId)
      .all()
  ).results as unknown as Array<{ pick: string; n: number }>;

  const counts: Record<Pick, number> = { W: 0, D: 0, L: 0 };
  for (const r of rows ?? []) {
    if (r.pick === 'W' || r.pick === 'D' || r.pick === 'L') counts[r.pick] = r.n;
  }
  const total = counts.W + counts.D + counts.L;

  let mine: Pick | null = null;
  if (anonKey) {
    const row = await db
      .prepare('SELECT pick FROM cannon_predictions WHERE match_id = ?1 AND anon_key = ?2')
      .bind(matchId, anonKey)
      .first<{ pick: string }>();
    if (row && (row.pick === 'W' || row.pick === 'D' || row.pick === 'L')) mine = row.pick;
  }

  return {
    counts,
    total,
    confidence: total > 0 ? Math.round((counts.W / total) * 100) : null,
    mine,
  };
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  const matchId = url.searchParams.get('match');
  if (!db || !isValidMatchId(matchId)) {
    return json(
      { counts: { W: 0, D: 0, L: 0 }, total: 0, confidence: null, mine: null },
      { headers: cors },
    );
  }
  const anonKey = url.searchParams.get('anonKey');
  return json(await summary(db, matchId, isValidAnonKey(anonKey) ? anonKey : null), {
    headers: cors,
  });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  if (!db) return json({ error: 'unavailable' }, { status: 503, headers: cors });

  let body: { matchId?: unknown; anonKey?: unknown; pick?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, { status: 400, headers: cors });
  }

  const { matchId, anonKey, pick } = body;
  if (!isValidMatchId(matchId)) {
    return json({ error: 'invalid-match' }, { status: 400, headers: cors });
  }
  if (!isValidAnonKey(anonKey)) {
    return json({ error: 'invalid-anon-key' }, { status: 400, headers: cors });
  }
  if (pick !== null && (typeof pick !== 'string' || !PICKS.has(pick))) {
    return json({ error: 'invalid-pick' }, { status: 400, headers: cors });
  }

  if (pick === null) {
    await db
      .prepare('DELETE FROM cannon_predictions WHERE match_id = ?1 AND anon_key = ?2')
      .bind(matchId, anonKey)
      .run();
  } else {
    await db
      .prepare(
        'INSERT INTO cannon_predictions (match_id, anon_key, pick, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (match_id, anon_key) DO UPDATE SET pick = excluded.pick, created_at = excluded.created_at',
      )
      .bind(matchId, anonKey, pick, Date.now())
      .run();
  }

  return json(await summary(db, matchId, anonKey), { headers: cors });
};
