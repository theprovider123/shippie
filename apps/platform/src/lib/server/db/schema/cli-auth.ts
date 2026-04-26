import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const cliDeviceCodes = sqliteTable(
  'cli_device_codes',
  {
    deviceCode: text('device_code').primaryKey(),
    userCode: text('user_code').notNull().unique(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    clientName: text('client_name').notNull(),
    scopes: text('scopes', { mode: 'json' })
      .$type<string[]>()
      .default(sql`('[]')`)
      .notNull(),
    approvedAt: text('approved_at'),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('cli_device_codes_user_code_idx').on(t.userCode),
    index('cli_device_codes_expires_idx').on(t.expiresAt),
  ],
);

export type CliDeviceCode = typeof cliDeviceCodes.$inferSelect;
export type NewCliDeviceCode = typeof cliDeviceCodes.$inferInsert;

export const cliTokens = sqliteTable(
  'cli_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    clientName: text('client_name').notNull(),
    scopes: text('scopes', { mode: 'json' })
      .$type<string[]>()
      .default(sql`('[]')`)
      .notNull(),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    expiresAt: text('expires_at'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('cli_tokens_user_idx').on(t.userId),
    index('cli_tokens_active_idx').on(t.tokenHash),
  ],
);

export type CliToken = typeof cliTokens.$inferSelect;
export type NewCliToken = typeof cliTokens.$inferInsert;
