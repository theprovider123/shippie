import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

/**
 * Auth.js v5 adapter tables.
 *
 * These are used by the Drizzle adapter in apps/web/lib/auth to manage
 * platform (shippie.app) authentication: linked OAuth accounts, database
 * sessions, and magic-link verification tokens.
 *
 * DO NOT confuse these with `app_sessions` (added in a later migration),
 * which stores opaque handles for per-app OAuth sessions on
 * {slug}.shippie.app runtimes.
 *
 * Spec v6 §6, §18.4.
 */

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
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

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expires),
  ],
);

export type Session = typeof sessions.$inferSelect;

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull().unique(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.identifier, t.token] }),
    index('verification_tokens_expires_idx').on(t.expires),
  ],
);

export type VerificationToken = typeof verificationTokens.$inferSelect;
