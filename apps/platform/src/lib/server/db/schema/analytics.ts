import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

export const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    sessionId: text('session_id'),
    eventName: text('event_name').notNull(),
    properties: text('properties', { mode: 'json' }).$type<Record<string, unknown>>(),
    url: text('url'),
    referrer: text('referrer'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('analytics_events_app_created_idx').on(t.appId, t.createdAt),
    index('analytics_events_app_user_idx').on(t.appId, t.userId),
  ],
);
