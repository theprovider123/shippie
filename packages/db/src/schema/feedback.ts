import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Unified feedback inbox. Covers comments, bug reports, feature
 * requests, ratings, and praise. Maker dashboard reads from here;
 * ranking engine sums vote_count.
 *
 * Spec v6 §10.
 */
export const feedbackItems = pgTable(
  'feedback_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    status: text('status').notNull().default('open'),
    rating: integer('rating'),
    title: text('title'),
    body: text('body'),
    voteCount: integer('vote_count').notNull().default(0),
    duplicateOf: uuid('duplicate_of'),
    /** BYO backend user ID (from maker's Supabase/Firebase JWT `sub` claim). */
    externalUserId: text('external_user_id'),
    /** Display name for BYO users (from JWT `name` or `email` claim). */
    externalUserDisplay: text('external_user_display'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('feedback_items_app_status_idx').on(t.appId, t.status, t.createdAt),
  ],
);

export const feedbackVotes = pgTable(
  'feedback_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackId: uuid('feedback_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    externalUserId: text('external_user_id'),
    value: integer('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
);
