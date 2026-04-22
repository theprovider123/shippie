/**
 * End-user ratings + reviews for Shippie-deployed apps.
 *
 * One row per (user, app). Rating is 1–5 stars; review text is
 * optional. Ratings are marketplace-side only — maker apps don't see
 * per-user rating data.
 */
import { integer, pgTable, primaryKey, text, timestamp, index } from 'drizzle-orm/pg-core';

export const appRatings = pgTable(
  'app_ratings',
  {
    appId: text('app_id').notNull(),
    userId: text('user_id').notNull(),
    rating: integer('rating').notNull(),
    review: text('review'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.userId] }),
    index('app_ratings_app_created').on(t.appId, t.createdAt),
    index('app_ratings_user_created').on(t.userId, t.createdAt),
  ],
);
