/**
 * Feed Protocol storage over D1 (`app_feeds`). Latest snapshot per (app, feed); a changed publish
 * bumps `sequence`, an identical payload is a no-op (same sequence + hash). Pure-ish: all D1 access
 * is funnelled through here so routes stay thin.
 */
import { buildEnvelope, hashPayload, type FeedEnvelope, type FeedSource } from './envelope';

interface FeedRow {
  id: string;
  app_slug: string;
  feed_id: string;
  data_schema: string;
  sequence: number;
  updated_at: string;
  stale_after: string | null;
  hash: string;
  source_kind: string;
  source_name: string | null;
  payload: string;
  created_at: number;
}

function rowToEnvelope(row: FeedRow): FeedEnvelope {
  let payload: unknown = {};
  try { payload = JSON.parse(row.payload); } catch { payload = {}; }
  return {
    schema: 'shippie.feed.v1',
    app: row.app_slug,
    feed: row.feed_id,
    dataSchema: row.data_schema,
    sequence: row.sequence,
    updatedAt: row.updated_at,
    ...(row.stale_after ? { staleAfter: row.stale_after } : {}),
    hash: row.hash,
    source: { kind: row.source_kind as FeedSource['kind'], ...(row.source_name ? { name: row.source_name } : {}) },
    payload,
  };
}

export async function getLatestFeed(
  db: D1Database,
  appSlug: string,
  feedId: string,
): Promise<FeedEnvelope | null> {
  const row = await db
    .prepare('SELECT * FROM app_feeds WHERE app_slug = ? AND feed_id = ? LIMIT 1')
    .bind(appSlug, feedId)
    .first<FeedRow>();
  return row ? rowToEnvelope(row) : null;
}

export interface PublishInput {
  appSlug: string;
  feedId: string;
  dataSchema: string;
  payload: unknown;
  staleAfter?: string;
  source?: FeedSource;
  /** ISO timestamp for updatedAt + ms epoch for created_at; injected for testability. */
  updatedAt: string;
  nowMs: number;
}

export interface PublishResult {
  envelope: FeedEnvelope;
  changed: boolean;
}

/** Upsert a snapshot. Identical payload → no sequence bump (changed:false). */
export async function publishFeed(db: D1Database, input: PublishInput): Promise<PublishResult> {
  const id = `${input.appSlug}:${input.feedId}`;
  const nextHash = hashPayload(input.payload);
  const existing = await db
    .prepare('SELECT sequence, hash FROM app_feeds WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ sequence: number; hash: string }>();

  if (existing && existing.hash === nextHash) {
    const current = await getLatestFeed(db, input.appSlug, input.feedId);
    return { envelope: current!, changed: false };
  }

  const sequence = (existing?.sequence ?? 0) + 1;
  const envelope = buildEnvelope({
    app: input.appSlug,
    feed: input.feedId,
    dataSchema: input.dataSchema,
    payload: input.payload,
    sequence,
    updatedAt: input.updatedAt,
    staleAfter: input.staleAfter,
    source: input.source,
  });

  await db
    .prepare(
      `INSERT INTO app_feeds (id, app_slug, feed_id, data_schema, sequence, updated_at, stale_after, hash, source_kind, source_name, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data_schema = excluded.data_schema,
         sequence = excluded.sequence,
         updated_at = excluded.updated_at,
         stale_after = excluded.stale_after,
         hash = excluded.hash,
         source_kind = excluded.source_kind,
         source_name = excluded.source_name,
         payload = excluded.payload`,
    )
    .bind(
      id,
      input.appSlug,
      input.feedId,
      input.dataSchema,
      sequence,
      input.updatedAt,
      input.staleAfter ?? null,
      envelope.hash,
      envelope.source.kind,
      envelope.source.name ?? null,
      JSON.stringify(input.payload),
      input.nowMs,
    )
    .run();

  return { envelope, changed: true };
}
