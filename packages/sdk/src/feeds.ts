/**
 * Shippie Feed Protocol — client side. Feeds are lane-3 data refreshes (live scores, fixtures,
 * prices): silent, cached, offline-friendly. This is the SDK's first networked namespace, but it
 * degrades to the last-good cached snapshot offline — consistent with the local-first ethos.
 *
 * The envelope shape + hash mirror the platform (`apps/platform/src/lib/server/feeds/envelope.ts`)
 * so a client can verify integrity. See the spec:
 * docs/superpowers/specs/2026-06-08-shippie-feed-protocol-design.md
 */

export const FEED_ENVELOPE_SCHEMA = 'shippie.feed.v1';

export type FeedSourceKind = 'external-api' | 'maker-upload' | 'manual';

export interface FeedEnvelope<T = unknown> {
  schema: typeof FEED_ENVELOPE_SCHEMA;
  app: string;
  feed: string;
  dataSchema: string;
  sequence: number;
  updatedAt: string;
  staleAfter?: string;
  hash: string;
  source: { kind: FeedSourceKind; name?: string };
  payload: T;
}

const DEFAULT_ORIGIN = 'https://shippie.app';
let origin = DEFAULT_ORIGIN;

/** Override the platform origin feeds are fetched from (defaults to https://shippie.app). */
export function configureFeeds(opts: { origin?: string }): void {
  if (opts.origin) origin = opts.origin.replace(/\/$/, '');
}

// ── Pure helpers (mirror the platform envelope) ──
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
export function hashPayload(payload: unknown): string {
  const str = canonicalJSON(payload);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`;
}
export function hasChanged(envelope: Pick<FeedEnvelope, 'sequence'>, since?: number): boolean {
  if (since == null || !Number.isFinite(since)) return true;
  return envelope.sequence > since;
}

function cacheKey(app: string, feed: string): string {
  return `shippie:feed:${app}:${feed}`;
}

function readCache(app: string, feed: string): FeedEnvelope | null {
  try {
    const raw = localStorage.getItem(cacheKey(app, feed));
    return raw ? (JSON.parse(raw) as FeedEnvelope) : null;
  } catch {
    return null;
  }
}
function writeCache(env: FeedEnvelope): void {
  try {
    localStorage.setItem(cacheKey(env.app, env.feed), JSON.stringify(env));
  } catch {
    /* quota — ignore */
  }
}

/** Synchronous last-good snapshot (for an offline cold start). */
export function cached(app: string, feed: string): FeedEnvelope | null {
  return readCache(app, feed);
}

export interface GetOptions {
  since?: number;
  origin?: string;
}

/**
 * Fetch the latest snapshot. Falls back to the last-good cache offline. Returns null only when
 * there is no snapshot at all (no network + no cache). Updates the cache on a successful fetch.
 */
export async function get<T = unknown>(app: string, feed: string, opts: GetOptions = {}): Promise<FeedEnvelope<T> | null> {
  const base = (opts.origin ?? origin).replace(/\/$/, '');
  const since = opts.since;
  const url = `${base}/api/apps/${encodeURIComponent(app)}/feeds/${encodeURIComponent(feed)}${since != null ? `?since=${since}` : ''}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.status === 404) return (readCache(app, feed) as FeedEnvelope<T>) ?? null;
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const data = (await res.json()) as { changed?: boolean } | FeedEnvelope<T>;
    if (data && (data as { changed?: boolean }).changed === false) {
      // Unchanged since the caller's sequence — hand back what they already had.
      return (readCache(app, feed) as FeedEnvelope<T>) ?? null;
    }
    const env = data as FeedEnvelope<T>;
    if (env?.schema === FEED_ENVELOPE_SCHEMA) writeCache(env);
    return env ?? null;
  } catch {
    return (readCache(app, feed) as FeedEnvelope<T>) ?? null;
  }
}

export interface SubscribeOptions {
  intervalMs?: number;
  origin?: string;
}

/**
 * Poll a feed and invoke `cb` only when the sequence advances. Fires once immediately with the
 * current snapshot (cache or network). Returns an unsubscribe function.
 */
export function subscribe<T = unknown>(
  app: string,
  feed: string,
  cb: (env: FeedEnvelope<T>) => void,
  opts: SubscribeOptions = {},
): () => void {
  let stopped = false;
  let lastSeq = -1;
  const interval = Math.max(5000, opts.intervalMs ?? 30000);

  const tick = async () => {
    if (stopped) return;
    const env = await get<T>(app, feed, { since: lastSeq >= 0 ? lastSeq : undefined, origin: opts.origin });
    if (env && env.sequence > lastSeq) {
      lastSeq = env.sequence;
      if (!stopped) cb(env);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), interval) as unknown as { unref?: () => void };
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer as unknown as ReturnType<typeof setInterval>);
  };
}
