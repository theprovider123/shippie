/**
 * Golazo live feed — serves the World Cup showcase its tournament data
 * ({ updatedAt, news, live, results }) from KV (`golazo:feed:v1`), refreshed
 * every five minutes by the cron (see lib/server/cron/golazo-feed.ts). When KV is empty or
 * unavailable it returns a bundled fallback (kept in sync with the showcase's
 * own public/feed.json), so the app is never blank and stays offline-first.
 *
 * Same-origin only; the showcase iframe (allow-same-origin) fetches this at
 * `/__shippie/golazo/feed`, falling back to its bundled `./feed.json` if this
 * route 404s (e.g. local Vite dev).
 */
import type { RequestHandler } from './$types';

const KV_KEY = 'golazo:feed:v1';

// Bundled fallback — mirror of apps/showcase-golazo/public/feed.json.
const FALLBACK = JSON.stringify({
  updatedAt: '',
  news: [
    { at: '', text: 'Build your bracket now — kick-off is June 11.' },
    { at: '', text: 'Start a pool and share your link to fill the table.' },
  ],
  live: [],
  results: { groups: {}, knockout: {} },
});

export const GET: RequestHandler = async ({ platform }) => {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=30',
  };
  try {
    const cached = await platform?.env.CACHE.get(KV_KEY);
    if (cached) return new Response(cached, { status: 200, headers });
  } catch (err) {
    console.error('[golazo-feed] KV read failed:', err);
  }
  return new Response(FALLBACK, { status: 200, headers });
};
