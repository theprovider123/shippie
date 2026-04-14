import { index, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Per-app opaque-handle sessions for {slug}.shippie.app runtime origins.
 *
 * `handle_hash` is SHA-256 of the random 32-byte cookie handle.
 * Nothing else is in the cookie — all claims live in this row.
 *
 * Spec v6 §6 (auth architecture), §13.7 (revocation), Fix v5.1.1.
 */
export const appSessions = pgTable(
  'app_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handleHash: text('handle_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    scope: text('scope').array().notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    deviceFingerprint: text('device_fingerprint'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rotatedFrom: uuid('rotated_from').references((): AnyPgColumn => appSessions.id),
  },
  (t) => [
    index('app_sessions_user_app_active_idx').on(t.userId, t.appId),
    index('app_sessions_handle_active_idx').on(t.handleHash),
    index('app_sessions_expires_idx').on(t.expiresAt),
  ],
);

export type AppSession = typeof appSessions.$inferSelect;
export type NewAppSession = typeof appSessions.$inferInsert;
