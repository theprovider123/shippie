/**
 * Vector-space helpers for journal entries. Pure functions, no library.
 * Used by semantic search + topic clustering. The Shippie AI app provides
 * the embeddings; this module never calls the model itself.
 */

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return Number.NaN;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    an += av * av;
    bn += bv * bv;
  }
  const mag = Math.sqrt(an) * Math.sqrt(bn);
  if (mag === 0) return 0;
  return dot / mag;
}

export interface RankedEntry<T> {
  entry: T;
  score: number;
}

export function rankByCosine<T extends { embedding?: Float32Array | null }>(
  query: Float32Array,
  entries: T[],
  limit = 10,
): RankedEntry<T>[] {
  const scored: RankedEntry<T>[] = [];
  for (const entry of entries) {
    if (!entry.embedding) continue;
    const score = cosine(query, entry.embedding);
    if (!Number.isFinite(score)) continue;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function toFloat32(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) return value;
  if (value instanceof Uint8Array && value.byteLength % 4 === 0) {
    return new Float32Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (Array.isArray(value)) return new Float32Array(value.map(Number));
  return null;
}

/**
 * Year-in-review extractive selection. Pick the top-N entries from a
 * year by *magnitude of sentiment* — biggest highs and lows. Pure,
 * deterministic, no language model involved.
 */
export interface TopEntryResult<T> {
  entry: T;
  magnitude: number;
}

export function selectTopByMagnitude<T extends { sentiment?: number | null }>(
  entries: T[],
  limit = 5,
): TopEntryResult<T>[] {
  const scored: TopEntryResult<T>[] = [];
  for (const entry of entries) {
    const value = entry.sentiment;
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    scored.push({ entry, magnitude: Math.abs(value) });
  }
  scored.sort((a, b) => b.magnitude - a.magnitude);
  return scored.slice(0, limit);
}

/**
 * Group entries by topic. Returns map keyed by topic, values are arrays
 * preserving the original ordering of entries (typically newest-first).
 */
export function groupByTopic<T extends { topic?: string | null }>(
  entries: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const t = e.topic ?? 'unclassified';
    const list = map.get(t);
    if (list) list.push(e);
    else map.set(t, [e]);
  }
  return map;
}
