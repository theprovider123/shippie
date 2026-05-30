/**
 * Spotlight cross-app search (Tranche 2).
 *
 * Apps publish searchable items via `shippie.search.publish([{...}])`
 * (capability `search.publish`). The container indexes them in
 * IndexedDB and serves a system-wide search surface that returns
 * deeplinks. The user's index never leaves the device.
 *
 * 5A foundation: registry + scorer are pure functions, easy to unit
 * test. The Spotlight UI and the IDB-backed index live in the
 * platform; this module is the matching engine.
 */

export interface SpotlightItem {
  appSlug: string;
  /** Stable item id within the app namespace. */
  id: string;
  title: string;
  body?: string;
  deeplink: string;
  /** Optional category for filtering (e.g. 'recipe', 'note', 'event'). */
  kind?: string;
  /** Optional ts for recency ranking. */
  updatedAt?: number;
}

export interface SpotlightHit extends SpotlightItem {
  /** 0..1, higher is better. */
  score: number;
}

export interface SpotlightSearchOptions {
  limit?: number;
  /** Only return hits for these app slugs. */
  appSlugs?: readonly string[];
  /** Only return hits whose kind matches. */
  kinds?: readonly string[];
}

export function search(
  query: string,
  items: readonly SpotlightItem[],
  opts: SpotlightSearchOptions = {},
): SpotlightHit[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const appFilter = opts.appSlugs ? new Set(opts.appSlugs) : null;
  const kindFilter = opts.kinds ? new Set(opts.kinds) : null;
  const limit = opts.limit ?? 25;

  const hits: SpotlightHit[] = [];
  for (const item of items) {
    if (appFilter && !appFilter.has(item.appSlug)) continue;
    if (kindFilter && item.kind && !kindFilter.has(item.kind)) continue;

    const haystack = `${item.title}\n${item.body ?? ''}`.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      if (!haystack.includes(token)) {
        matchedAll = false;
        break;
      }
      // Title hits weigh more than body hits.
      score += item.title.toLowerCase().includes(token) ? 2 : 1;
    }
    if (!matchedAll) continue;

    // Recency boost — newer items get a small bump.
    if (item.updatedAt) {
      const ageDays = (Date.now() - item.updatedAt) / (24 * 3600 * 1000);
      if (ageDays < 7) score += 0.5;
      else if (ageDays < 30) score += 0.25;
    }

    hits.push({ ...item, score: normaliseScore(score, tokens.length) });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function normaliseScore(raw: number, tokenCount: number): number {
  // Maximum per token is 2.5 (title hit + recency boost). Normalise into
  // [0, 1] with a soft cap so a single very-good hit doesn't always
  // saturate ahead of a multi-token okay hit.
  const max = tokenCount * 2.5;
  if (max === 0) return 0;
  return Math.min(1, raw / max);
}

/**
 * Cap on items per app so a single misbehaving showcase can't crowd
 * out everyone else in the index. 5A spec: 5_000 per app, 25_000
 * global; bridge gate rejects publish requests over the per-app limit.
 */
export const SPOTLIGHT_PER_APP_LIMIT = 5_000;
export const SPOTLIGHT_GLOBAL_LIMIT = 25_000;
