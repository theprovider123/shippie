import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const appRatings = sqliteTable(
  'app_ratings',
  {
    appId: text('app_id').notNull(),
    userId: text('user_id').notNull(),
    rating: integer('rating').notNull(),
    review: text('review'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.userId] }),
    index('app_ratings_app_created').on(t.appId, t.createdAt),
    index('app_ratings_user_created').on(t.userId, t.createdAt),
  ],
);
