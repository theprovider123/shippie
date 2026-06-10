/**
 * GET  /api/cannon/takes?thread=MATCH&anonKey=… -> { takes: [...] } (50 newest)
 * POST /api/cannon/takes {handle,anonKey,thread,text}  -> { take } (201)
 *
 * The Terrace feed for The Cannon. Backed by cannon_takes in the shared
 * platform D1 (migration 0060). CORS-open like /api/golazo/scores; the
 * showcase degrades to its seeded local feed when this is unreachable.
 */
import { json } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import {
  COMPOSE_COOLDOWN_MS,
  LIST_LIMIT,
  MAX_TEXT,
  THREADS,
  cors,
  isValidAnonKey,
  isValidHandle,
  publicTake,
  type TakeRow,
} from '$lib/server/cannon';

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: cors });

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  if (!db) return json({ takes: [] }, { headers: cors });

  const thread = url.searchParams.get('thread');
  const anonKey = url.searchParams.get('anonKey');

  const stmt =
    thread && THREADS.has(thread)
      ? db
          .prepare(
            'SELECT id, handle, thread, text, up, down, created_at FROM cannon_takes WHERE thread = ?1 ORDER BY created_at DESC LIMIT ?2',
          )
          .bind(thread, LIST_LIMIT)
      : db
          .prepare(
            'SELECT id, handle, thread, text, up, down, created_at FROM cannon_takes ORDER BY created_at DESC LIMIT ?1',
          )
          .bind(LIST_LIMIT);

  const rows = ((await stmt.all()).results ?? []) as unknown as TakeRow[];

  const myVotes = new Map<string, 'up' | 'down'>();
  if (isValidAnonKey(anonKey) && rows.length > 0) {
    const placeholders = rows.map((_, i) => `?${i + 2}`).join(',');
    const votes = (
      await db
        .prepare(
          `SELECT take_id, dir FROM cannon_votes WHERE anon_key = ?1 AND take_id IN (${placeholders})`,
        )
        .bind(anonKey, ...rows.map((r) => r.id))
        .all()
    ).results as unknown as Array<{ take_id: string; dir: number }>;
    for (const v of votes ?? []) myVotes.set(v.take_id, v.dir === 1 ? 'up' : 'down');
  }

  return json(
    { takes: rows.map((row) => publicTake(row, myVotes.get(row.id) ?? null)) },
    { headers: cors },
  );
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB as D1Database | undefined;
  if (!db) return json({ error: 'unavailable' }, { status: 503, headers: cors });

  let body: { handle?: unknown; anonKey?: unknown; thread?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, { status: 400, headers: cors });
  }

  const { handle, anonKey, thread, text } = body;
  if (!isValidHandle(handle)) {
    return json({ error: 'invalid-handle' }, { status: 400, headers: cors });
  }
  if (!isValidAnonKey(anonKey)) {
    return json({ error: 'invalid-anon-key' }, { status: 400, headers: cors });
  }
  if (typeof thread !== 'string' || !THREADS.has(thread)) {
    return json({ error: 'invalid-thread' }, { status: 400, headers: cors });
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return json({ error: 'empty-text' }, { status: 400, headers: cors });
  }
  const trimmed = text.trim();
  if (trimmed.length > MAX_TEXT) {
    return json({ error: 'text-too-long', max: MAX_TEXT }, { status: 400, headers: cors });
  }

  const now = Date.now();
  const last = await db
    .prepare('SELECT created_at FROM cannon_takes WHERE anon_key = ?1 ORDER BY created_at DESC LIMIT 1')
    .bind(anonKey)
    .first<{ created_at: number }>();
  if (last && now - last.created_at < COMPOSE_COOLDOWN_MS) {
    return json({ error: 'cooldown' }, { status: 429, headers: cors });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO cannon_takes (id, handle, anon_key, thread, text, up, down, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6)',
    )
    .bind(id, handle, anonKey, thread, trimmed, now)
    .run();

  return json(
    {
      take: publicTake(
        { id, handle, thread, text: trimmed, up: 0, down: 0, created_at: now },
        null,
      ),
    },
    { status: 201, headers: cors },
  );
};
