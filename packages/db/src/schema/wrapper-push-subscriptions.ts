// packages/db/src/schema/wrapper-push-subscriptions.ts
/**
 * Web Push subscriptions for the PWA wrapper runtime.
 *
 * Distinct from `push_subscriptions` (see ./push-subscriptions.ts) which
 * serves the platform's OAuth / browser-notification flow with typed
 * FKs to `apps` and `users`. This table is keyed by endpoint alone so
 * the Worker can upsert without needing user identity, and stores
 * only what the Web Push protocol requires.
 */
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const wrapperPushSubscriptions = pgTable(
  'wrapper_push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    appId: text('app_id').notNull(),
    userId: text('user_id'),
    keys: jsonb('keys').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wrapper_push_app').on(t.appId)],
);
