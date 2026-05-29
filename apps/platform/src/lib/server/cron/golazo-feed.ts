/**
 * Golazo live-feed refresh.
 *
 * Pulls the World Cup showcase feed ({ updatedAt, news, live, results }) from a
 * configured upstream URL into KV (`golazo:feed:v1`), where the
 * `/__shippie/golazo/feed` endpoint serves it to the showcase. Runs on the
 * five-minute cron so live scores stay fresh during matches.
 *
 * Decoupled by design: the upstream (`GOLAZO_FEED_UPSTREAM`) returns our feed
 * shape directly, so the data source (an aggregator, a football-data mapper,
 * a hand-edited gist) can change without touching this code. Unset upstream =
 * safe no-op; the endpoint keeps serving its bundled fallback.
 */
import type { CronEnv } from './index';

export const GOLAZO_FEED_KV_KEY = 'golazo:feed:v1';

export async function golazoFeed(env: CronEnv): Promise<{ updated: boolean }> {
  const upstream = env.GOLAZO_FEED_UPSTREAM;
  if (!upstream) {
    console.log('[cron:golazo-feed] GOLAZO_FEED_UPSTREAM unset — skipping');
    return { updated: false };
  }
  try {
    const res = await fetch(upstream, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const text = await res.text();
    // Validate it parses as JSON of the expected shape before caching, so a
    // broken upstream can never poison the endpoint.
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !('results' in parsed)) {
      throw new Error('upstream payload missing feed shape');
    }
    await env.CACHE.put(GOLAZO_FEED_KV_KEY, text, { expirationTtl: 600 });
    console.log('[cron:golazo-feed] refreshed golazo:feed:v1');
    return { updated: true };
  } catch (err) {
    console.error('[cron:golazo-feed] refresh failed:', err);
    return { updated: false };
  }
}
