// packages/db/src/schema/app-events.ts
/**
 * Unified event spine for the PWA wrapper runtime.
 *
 * `app_events` is partitioned by month (see migration) so retention
 * trims by dropping old partitions — O(1) delete vs. O(N) row scan.
 *
 * `usage_daily` is the rollup target, populated by an hourly cron.
 */
import { bigserial, bigint, jsonb, pgTable, text, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';

export const appEvents = pgTable(
  'app_events',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    appId: text('app_id').notNull(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id'),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite PK includes `ts` because the table is partitioned by ts.
    primaryKey({ columns: [t.id, t.ts] }),
    index('app_events_app_ts').on(t.appId, t.ts),
    index('app_events_type_ts').on(t.eventType, t.ts),
  ],
);

export const usageDaily = pgTable(
  'usage_daily',
  {
    appId: text('app_id').notNull(),
    day: timestamp('day', { withTimezone: true }).notNull(),
    eventType: text('event_type').notNull(),
    count: bigint('count', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.day, t.eventType] }),
    index('usage_daily_app_day').on(t.appId, t.day),
  ],
);
