import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Feed Protocol storage — the latest snapshot of each app data feed (lane 3: silent data
 * refresh, distinct from app-package updates). Keyed by public app *slug* (not the apps.id FK)
 * because feeds address curated showcases too, which live in the container registry rather than
 * the apps table. One row per (app, feed); `sequence` bumps on every changed publish so clients
 * can cheaply detect change. See docs/superpowers/specs/2026-06-08-shippie-feed-protocol-design.md
 */
export const appFeeds = sqliteTable(
  'app_feeds',
  {
    id: text('id').primaryKey(), // `${appSlug}:${feedId}`
    appSlug: text('app_slug').notNull(),
    feedId: text('feed_id').notNull(),
    dataSchema: text('data_schema').notNull(),
    sequence: integer('sequence').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
    staleAfter: text('stale_after'),
    hash: text('hash').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceName: text('source_name'),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('app_feeds_app_feed_idx').on(t.appSlug, t.feedId)],
);
