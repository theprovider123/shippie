import { integer, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Lucia + legacy Auth.js parity tables.
 *
 * `sessions` is Lucia-shaped (id, user_id, expires_at). The mirror script
 * leaves `sessions` rows behind on cutover — every session re-issues at
 * Lucia migration. Kept here so Drizzle types still resolve.
 *
 * `accounts` and `verification_tokens` are retained from the Postgres
 * schema for one-shot mirror (linked OAuth accounts + magic-link tokens
 * we may want to read during the transition window).
 */

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** ISO timestamp string — Lucia adapter expects this shape. */
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;

export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('accounts_user_id_idx').on(t.userId),
  ],
);

export type Account = typeof accounts.$inferSelect;

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull().unique(),
    expires: text('expires').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.identifier, t.token] }),
    index('verification_tokens_expires_idx').on(t.expires),
  ],
);

export type VerificationToken = typeof verificationTokens.$inferSelect;
