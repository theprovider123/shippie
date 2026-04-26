import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

export const feedbackItems = sqliteTable(
  'feedback_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    status: text('status').notNull().default('open'),
    rating: integer('rating'),
    title: text('title'),
    body: text('body'),
    voteCount: integer('vote_count').notNull().default(0),
    duplicateOf: text('duplicate_of'),
    externalUserId: text('external_user_id'),
    externalUserDisplay: text('external_user_display'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('feedback_items_app_status_idx').on(t.appId, t.status, t.createdAt)],
);

export const feedbackVotes = sqliteTable('feedback_votes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  feedbackId: text('feedback_id').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  externalUserId: text('external_user_id'),
  value: integer('value').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
});
