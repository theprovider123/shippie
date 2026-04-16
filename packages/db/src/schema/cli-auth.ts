import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.ts';

/**
 * OAuth 2.0 Device Authorization Grant tables.
 *
 * Used by the CLI (`shippie login`) and MCP server to authenticate
 * without needing a full OAuth redirect — the user opens a URL on
 * their own, approves the device code, and the CLI polls for the
 * resulting bearer token.
 *
 * See migration 0012_cli_tokens.sql for column commentary.
 */
export const cliDeviceCodes = pgTable(
  'cli_device_codes',
  {
    deviceCode: text('device_code').primaryKey(),
    userCode: text('user_code').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    clientName: text('client_name').notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('cli_device_codes_user_code_idx').on(t.userCode),
    index('cli_device_codes_expires_idx').on(t.expiresAt),
  ],
);

export type CliDeviceCode = typeof cliDeviceCodes.$inferSelect;
export type NewCliDeviceCode = typeof cliDeviceCodes.$inferInsert;

export const cliTokens = pgTable(
  'cli_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    clientName: text('client_name').notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cli_tokens_user_idx').on(t.userId), index('cli_tokens_active_idx').on(t.tokenHash)],
);

export type CliToken = typeof cliTokens.$inferSelect;
export type NewCliToken = typeof cliTokens.$inferInsert;
