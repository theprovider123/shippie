/**
 * Co-install / co-touch graph for marketplace recommendations.
 *
 * One row per canonical (app_a, app_b) pair where `app_a < app_b`
 * lexicographically — the CHECK constraint keeps the pair canonical so
 * we never double-count (A,B) vs (B,A). `users` is a running count of
 * how many distinct users have touched both apps, maintained by the
 * hourly rollup cron.
 */
import { bigint, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const userTouchGraph = pgTable(
  'user_touch_graph',
  {
    appA: text('app_a').notNull(),
    appB: text('app_b').notNull(),
    users: bigint('users', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.appA, t.appB] }),
    index('utg_app_a').on(t.appA, t.users),
    index('utg_app_b').on(t.appB, t.users),
  ],
);
