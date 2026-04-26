import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

/**
 * Multi-tenant SDK storage. D1/SQLite port.
 *
 * Postgres RLS doesn't exist in SQLite — scoping is enforced in app
 * code (the `+server.ts` handlers) instead of session variables. The
 * partial unique indexes for public/private rows are kept as raw SQL
 * in the migration since drizzle-kit can't emit `WHERE` clauses on
 * SQLite indexes via the table builder.
 */
export const appData = sqliteTable(
  'app_data',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    collection: text('collection').notNull(),
    key: text('key').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    isPublic: integer('is_public', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('app_data_app_user_idx').on(t.appId, t.userId, t.collection)],
);

export type AppDataRow = typeof appData.$inferSelect;
export type NewAppDataRow = typeof appData.$inferInsert;

export const appFiles = sqliteTable(
  'app_files',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    r2Key: text('r2_key').notNull().unique(),
    sizeBytes: integer('size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('app_files_app_user_idx').on(t.appId, t.userId)],
);
export type AppFile = typeof appFiles.$inferSelect;
