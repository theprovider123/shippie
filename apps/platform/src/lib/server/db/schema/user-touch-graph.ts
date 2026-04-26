import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const userTouchGraph = sqliteTable(
  'user_touch_graph',
  {
    appA: text('app_a').notNull(),
    appB: text('app_b').notNull(),
    users: integer('users').notNull().default(0),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.appA, t.appB] }),
    index('utg_app_a').on(t.appA, t.users),
    index('utg_app_b').on(t.appB, t.users),
  ],
);
