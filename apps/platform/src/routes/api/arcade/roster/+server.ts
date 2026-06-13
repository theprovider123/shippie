import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { loadArcadeRoster } from '$server/arcade/roster';

/**
 * Tiny stable hash so the SW can revalidate cheaply. Underscore-prefixed
 * because SvelteKit `+server.ts` modules may only export HTTP verbs (or
 * `_`-prefixed helpers) — a bare `rev` export fails the build.
 */
export function _rev(enabled: string[], blocked: string[]): string {
  const seed = `${enabled.slice().sort().join(',')}|${blocked.slice().sort().join(',')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) {
    return json({ enabled: [], blocked: [], rev: '0' }, { status: 503 });
  }
  const db = getDrizzleClient(env.DB);
  const { enabled, blocked } = await loadArcadeRoster(db);
  return json(
    { enabled, blocked, rev: _rev(enabled, blocked) },
    { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
};
