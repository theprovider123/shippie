import { index, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

/**
 * Per-app opaque-handle sessions for {slug}.shippie.app runtime origins.
 * D1/SQLite port — distinct from the platform's `sessions` table.
 *
 * `scope` is a JSON-typed text column (was Postgres text[]).
 */
export const appSessions = sqliteTable(
  'app_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    handleHash: text('handle_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    scope: text('scope', { mode: 'json' }).$type<string[]>().notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    deviceFingerprint: text('device_fingerprint'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    lastSeenAt: text('last_seen_at').default(sql`(datetime('now'))`).notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    rotatedFrom: text('rotated_from').references((): AnySQLiteColumn => appSessions.id),
  },
  (t) => [
    index('app_sessions_user_app_active_idx').on(t.userId, t.appId),
    index('app_sessions_handle_active_idx').on(t.handleHash),
    index('app_sessions_expires_idx').on(t.expiresAt),
  ],
);

export type AppSession = typeof appSessions.$inferSelect;
export type NewAppSession = typeof appSessions.$inferInsert;
