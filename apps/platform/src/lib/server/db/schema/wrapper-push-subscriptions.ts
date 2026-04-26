import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Web Push subscriptions for the PWA wrapper runtime. D1/SQLite port.
 *
 * Distinct from `push_subscriptions` (typed FKs to `apps`/`users`).
 */
export const wrapperPushSubscriptions = sqliteTable(
  'wrapper_push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    appId: text('app_id').notNull(),
    userId: text('user_id'),
    keys: text('keys', { mode: 'json' }).$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('wrapper_push_app').on(t.appId)],
);
