import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Web Push subscription endpoints (Phase 2 feature, schema ready).
 *
 * Spec v6 §18.5.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    authKey: text('auth_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('push_subscriptions_unique').on(t.userId, t.appId, t.endpoint),
    index('push_subscriptions_user_app_idx').on(t.userId, t.appId),
  ],
);
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
