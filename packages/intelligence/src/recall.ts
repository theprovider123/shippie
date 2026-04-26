/**
 * Recall — semantic search over the local page-view log.
 *
 * The recall layer answers "what did I look at recently that's similar to X?"
 * by embedding the query into a vector, walking the page-view log within an
 * optional timeframe, looking up each view's stored embedding, computing
 * cosine similarity, and returning the top-N most relevant hits.
 *
 * Embeddings are produced by the cross-origin Shippie AI app via
 * `window.shippie.local.ai.embed(text)`. Tests inject their own deterministic
 * `embed` function so we never have to mount the real bridge.
 *
 * Indexing is exposed as `indexPageView(viewId, text)` for callers that want
 * to back-fill embeddings for already-stored views (or wire up automatic
 * indexing in a follow-up). Failures are silently swallowed — a missing
 * embedding just means the view never surfaces in recall, which is a tolerable
 * degradation for a best-effort feature.
 */
import { appendEmbedding, getEmbedding, listPageViews } from './storage.ts';
import type { PageView, RecallHit } from './types.ts';

const DEFAULT_LIMIT = 5;
const VIEW_FETCH_LIMIT = 1000;
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export type EmbedFn = (text: string) => Promise<{ embedding: number[]; source?: string }>;

export interface RecallOptions {
  query: string;
  timeframe?: { sinceMs: number };
  limit?: number;
  /** Inject the embed fn for tests. Default uses shippie.local.ai.embed. */
  embed?: EmbedFn;
}

/**
 * Cosine similarity of two equal-length numeric vectors. Returns 0 when either
 * vector has zero magnitude (avoids NaN propagation into sort comparators).
 */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

interface ShippieAiBridge {
  embed?: EmbedFn;
}
interface ShippieLocal {
  ai?: ShippieAiBridge;
}
interface ShippieGlobal {
  local?: ShippieLocal;
}

/**
 * Default embed implementation. Pulls `window.shippie.local.ai.embed` at call
 * time so the bridge can be installed lazily. Throws if it isn't available —
 * recall has no useful fallback when there's no embedder.
 */
async function defaultEmbed(text: string): Promise<{ embedding: number[]; source?: string }> {
  if (typeof window === 'undefined') {
    throw new Error('recall: no window available; pass embed in tests/SSR');
  }
  const bridge = (window as unknown as { shippie?: ShippieGlobal }).shippie;
  const embedFn = bridge?.local?.ai?.embed;
  if (typeof embedFn !== 'function') {
    throw new Error('recall: window.shippie.local.ai.embed is not available');
  }
  return embedFn(text);
}

/**
 * Embed `text` and persist the resulting vector against `viewId`. All errors
 * (network, missing bridge, storage) are swallowed; the worst-case outcome is
 * that the view simply won't appear in recall results.
 */
export async function indexPageView(
  viewId: number,
  text: string,
  embedFn?: EmbedFn,
): Promise<void> {
  try {
    const embed = embedFn ?? defaultEmbed;
    const { embedding } = await embed(text);
    if (!embedding || embedding.length === 0) return;
    await appendEmbedding(viewId, new Float32Array(embedding));
  } catch {
    // Best-effort: silently drop.
  }
}

interface IndexedHit {
  view: PageView & { id: number };
  vec: Float32Array;
}

/**
 * Embed the query, walk the page-view log within the requested timeframe,
 * and return up to `limit` hits ordered by descending cosine similarity.
 * Views without a stored embedding are skipped.
 */
export async function recall(opts: RecallOptions): Promise<RecallHit[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const embed = opts.embed ?? defaultEmbed;
  const since = opts.timeframe?.sinceMs ?? Date.now() - DEFAULT_LOOKBACK_MS;

  const queryResult = await embed(opts.query);
  const queryVec = queryResult.embedding;
  if (!queryVec || queryVec.length === 0) return [];

  const views = await listPageViews({ since, limit: VIEW_FETCH_LIMIT });

  const indexed = await Promise.all(
    views.map(async (view): Promise<IndexedHit | null> => {
      const vec = await getEmbedding(view.id);
      return vec ? { view, vec } : null;
    }),
  );

  const hits: RecallHit[] = [];
  for (const entry of indexed) {
    if (!entry) continue;
    hits.push({
      path: entry.view.path,
      viewedAt: entry.view.ts,
      durationMs: entry.view.durationMs ?? 0,
      relevance: cosine(queryVec, entry.vec),
      excerpt: entry.view.excerpt ?? '',
    });
  }

  hits.sort((a, b) => b.relevance - a.relevance);
  return hits.slice(0, limit);
}
