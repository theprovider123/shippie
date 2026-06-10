/**
 * GET  /api/cannon/gauge?match=…&anonKey=… -> {avg,count,moods,mine}
 * POST /api/cannon/gauge {matchId,anonKey,rating?,mood?,moment?} -> same shape
 *
 * The post-match Gauge: one row per anonymous key per match holding rating
 * (1–10), mood, and moment-of-the-match. POST is a partial upsert — only the
 * fields present in the body change; an explicit null clears a field
 * (tapping your current rating un-rates).
 */
import { json } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import { MOODS, cors, isValidAnonKey, isValidMatchId } from '$lib/server/cannon';

const MAX_MOMENT = 140;

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

interface GaugeRow {
  rating: number | null;
  mood: string | null;
  moment: string | null;
}

async function summary(db: D1Database, matchId: string, anonKey: string | null) {
  const agg = await db
    .prepare(
      'SELECT ROUND(AVG(rating), 1) AS avg, COUNT(rating) AS count FROM cannon_gauge WHERE match_id = ?1 AND rating IS NOT NULL',
    )
    .bind(matchId)
    .first<{ avg: number | null; count: number }>();

  const moodRows = (
    await db
      .prepare(
        'SELECT mood, COUNT(*) AS n FROM cannon_gauge WHERE match_id = ?1 AND mood IS NOT NULL GROUP BY mood',
      )
      .bind(matchId)
      .all()
  ).results as unknown as Array<{ mood: string; n: number }>;

  const total = (moodRows ?? []).reduce((sum, r) => sum + r.n, 0);
  const moods: Record<string, number> = {};
  for (const m of MOODS) moods[m] = 0;
  if (total > 0) {
    for (const r of moodRows) moods[r.mood] = Math.round((r.n / total) * 100);
  }

  let mine: GaugeRow | null = null;
  if (anonKey) {
    mine =
      (await db
        .prepare(
          'SELECT rating, mood, moment FROM cannon_gauge WHERE match_id = ?1 AND anon_key = ?2',
        )
        .bind(matchId, anonKey)
        .first<GaugeRow>()) ?? null;
  }

  return {
    avg: agg?.avg ?? null,
    count: agg?.count ?? 0,
    moods,
    mine,
  };
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  const matchId = url.searchParams.get('match');
  if (!db || !isValidMatchId(matchId)) {
    return json({ avg: null, count: 0, moods: {}, mine: null }, { headers: cors });
  }
  const anonKey = url.searchParams.get('anonKey');
  return json(await summary(db, matchId, isValidAnonKey(anonKey) ? anonKey : null), {
    headers: cors,
  });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  if (!db) return json({ error: 'unavailable' }, { status: 503, headers: cors });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid-json' }, { status: 400, headers: cors });
  }

  const { matchId, anonKey } = body;
  if (!isValidMatchId(matchId)) {
    return json({ error: 'invalid-match' }, { status: 400, headers: cors });
  }
  if (!isValidAnonKey(anonKey)) {
    return json({ error: 'invalid-anon-key' }, { status: 400, headers: cors });
  }

  if ('rating' in body) {
    const r = body.rating;
    if (r !== null && (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 10)) {
      return json({ error: 'invalid-rating' }, { status: 400, headers: cors });
    }
  }
  if ('mood' in body) {
    const m = body.mood;
    if (m !== null && (typeof m !== 'string' || !MOODS.has(m))) {
      return json({ error: 'invalid-mood' }, { status: 400, headers: cors });
    }
  }
  if ('moment' in body) {
    const m = body.moment;
    if (m !== null && (typeof m !== 'string' || m.length > MAX_MOMENT)) {
      return json({ error: 'invalid-moment' }, { status: 400, headers: cors });
    }
  }

  // Partial upsert: read-merge-write so absent fields never clobber.
  const existing = await db
    .prepare('SELECT rating, mood, moment FROM cannon_gauge WHERE match_id = ?1 AND anon_key = ?2')
    .bind(matchId, anonKey)
    .first<GaugeRow>();

  const next: GaugeRow = {
    rating: 'rating' in body ? (body.rating as number | null) : (existing?.rating ?? null),
    mood: 'mood' in body ? (body.mood as string | null) : (existing?.mood ?? null),
    moment: 'moment' in body ? (body.moment as string | null) : (existing?.moment ?? null),
  };

  await db
    .prepare(
      'INSERT INTO cannon_gauge (match_id, anon_key, rating, mood, moment, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (match_id, anon_key) DO UPDATE SET rating = excluded.rating, mood = excluded.mood, moment = excluded.moment, updated_at = excluded.updated_at',
    )
    .bind(matchId, anonKey, next.rating, next.mood, next.moment, Date.now())
    .run();

  return json(await summary(db, matchId, anonKey), { headers: cors });
};
