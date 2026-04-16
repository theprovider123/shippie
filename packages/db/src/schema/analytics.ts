import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Minimal per-app analytics events. Not partitioned in MVP; when volume
 * warrants it, convert to RANGE partitioning by created_at (monthly).
 *
 * Spec v6 §10 (analytics), §18.5.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    sessionId: text('session_id'),
    eventName: text('event_name').notNull(),
    properties: jsonb('properties'),
    url: text('url'),
    referrer: text('referrer'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('analytics_events_app_created_idx').on(t.appId, t.createdAt),
    index('analytics_events_app_user_idx').on(t.appId, t.userId),
  ],
);
