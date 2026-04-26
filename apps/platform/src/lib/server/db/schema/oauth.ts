import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

export const oauthClients = sqliteTable(
  'oauth_clients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull().unique(),
    clientSecretHash: text('client_secret_hash'),
    redirectUris: text('redirect_uris', { mode: 'json' }).$type<string[]>().notNull(),
    allowedScopes: text('allowed_scopes', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('oauth_clients_app_idx').on(t.appId)],
);
export type OauthClient = typeof oauthClients.$inferSelect;
export type NewOauthClient = typeof oauthClients.$inferInsert;

export const oauthConsents = sqliteTable(
  'oauth_consents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    scope: text('scope', { mode: 'json' }).$type<string[]>().notNull(),
    consentedAt: text('consented_at').default(sql`(datetime('now'))`).notNull(),
    revokedAt: text('revoked_at'),
  },
  (t) => [
    uniqueIndex('oauth_consents_user_app_unique').on(t.userId, t.appId),
    index('oauth_consents_user_idx').on(t.userId),
    index('oauth_consents_app_idx').on(t.appId),
  ],
);
export type OauthConsent = typeof oauthConsents.$inferSelect;

export const oauthAuthorizationCodes = sqliteTable(
  'oauth_authorization_codes',
  {
    code: text('code').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    scope: text('scope', { mode: 'json' }).$type<string[]>().notNull(),
    expiresAt: text('expires_at').notNull(),
    used: integer('used', { mode: 'boolean' }).default(false).notNull(),
  },
  (t) => [index('oauth_authorization_codes_expires_idx').on(t.expiresAt)],
);
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
