import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Multi-tenant SDK storage. Every row is keyed by (app_id, user_id, collection, key).
 * Public rows have user_id=null and a separate partial unique index.
 *
 * RLS policies enforce scoping via two session variables set by the
 * platform API on every request:
 *   - app.current_app_id
 *   - app.current_user_id
 *
 * Spec v6 §18.5, Fix v5.1.1 RLS WITH CHECK.
 */
export const appData = pgTable(
  'app_data',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    collection: text('collection').notNull(),
    key: text('key').notNull(),
    data: jsonb('data').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('app_data_app_user_idx').on(t.appId, t.userId, t.collection),
    // Partial unique indexes are defined in the migration SQL:
    //   app_data_private_unique  (where is_public = false)
    //   app_data_public_unique   (where is_public = true)
    // Drizzle doesn't emit partial indexes with filters yet, so we
    // keep the SQL as the source of truth and only mirror the
    // non-partial index here for query planning.
  ],
);

export type AppDataRow = typeof appData.$inferSelect;
export type NewAppDataRow = typeof appData.$inferInsert;

export const appFiles = pgTable(
  'app_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    r2Key: text('r2_key').notNull().unique(),
    sizeBytes: integer('size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('app_files_app_user_idx').on(t.appId, t.userId)],
);
export type AppFile = typeof appFiles.$inferSelect;
