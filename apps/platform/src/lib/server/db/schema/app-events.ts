import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Unified event spine for the PWA wrapper runtime.
 *
 * Postgres version was monthly-partitioned. SQLite has no partitioning;
 * the retention cron uses `DELETE WHERE ts < datetime('now', '-60 days')`
 * to bound the table.
 *
 * `id` is auto-incrementing — Drizzle's `integer().primaryKey({ autoIncrement: true })`
 * maps to SQLite's INTEGER PRIMARY KEY semantics. We keep the composite
 * (id, ts) PK from the Postgres definition so the schema mirrors closely;
 * with the autoIncrement guarantee on `id`, this is safe.
 */
export const appEvents = sqliteTable(
  'app_events',
  {
    id: integer('id').notNull(),
    appId: text('app_id').notNull(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id'),
    eventType: text('event_type').notNull(),
    metadata: text('metadata', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default(sql`('{}')`)
      .notNull(),
    ts: text('ts').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.ts] }),
    index('app_events_app_ts').on(t.appId, t.ts),
    index('app_events_type_ts').on(t.eventType, t.ts),
  ],
);

export const usageDaily = sqliteTable(
  'usage_daily',
  {
    appId: text('app_id').notNull(),
    day: text('day').notNull(),
    eventType: text('event_type').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.day, t.eventType] }),
    index('usage_daily_app_day').on(t.appId, t.day),
  ],
);
