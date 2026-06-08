/**
 * Feed Protocol — the pure envelope. Build, canonicalise, hash, and change-detect a feed
 * snapshot. No DB, no platform deps, so it is trivially testable and identical on both sides of
 * the wire (the SDK mirrors this shape). See the spec:
 * docs/superpowers/specs/2026-06-08-shippie-feed-protocol-design.md
 */

export const FEED_ENVELOPE_SCHEMA = 'shippie.feed.v1';

export type FeedSourceKind = 'external-api' | 'maker-upload' | 'manual';

export interface FeedSource {
  kind: FeedSourceKind;
  name?: string;
}

export interface FeedEnvelope<T = unknown> {
  schema: typeof FEED_ENVELOPE_SCHEMA;
  app: string;
  feed: string;
  dataSchema: string;
  sequence: number;
  updatedAt: string;
  staleAfter?: string;
  hash: string;
  source: FeedSource;
  payload: T;
}

/** Deterministic JSON: object keys sorted recursively so the hash is stable. */
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

/** FNV-1a (32-bit) over the canonical payload. Cheap, dependency-free, good enough for change-detection. */
export function hashPayload(payload: unknown): string {
  const str = canonicalJSON(payload);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export interface BuildEnvelopeInput<T = unknown> {
  app: string;
  feed: string;
  dataSchema: string;
  payload: T;
  sequence: number;
  updatedAt: string;
  staleAfter?: string;
  source?: FeedSource;
}

export function buildEnvelope<T>(input: BuildEnvelopeInput<T>): FeedEnvelope<T> {
  return {
    schema: FEED_ENVELOPE_SCHEMA,
    app: input.app,
    feed: input.feed,
    dataSchema: input.dataSchema,
    sequence: input.sequence,
    updatedAt: input.updatedAt,
    ...(input.staleAfter ? { staleAfter: input.staleAfter } : {}),
    hash: hashPayload(input.payload),
    source: input.source ?? { kind: 'manual' },
    payload: input.payload,
  };
}

/** Has the feed moved past what the client already has? No `since` → always "changed". */
export function hasChanged(envelope: Pick<FeedEnvelope, 'sequence'>, since?: number): boolean {
  if (since == null || !Number.isFinite(since)) return true;
  return envelope.sequence > since;
}
