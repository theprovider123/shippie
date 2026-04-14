import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Per-app OAuth 2.0 client registrations.
 *
 * Spec v6 §6 (auth architecture), §18.4.
 */
export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull().unique(),
    clientSecretHash: text('client_secret_hash'),
    redirectUris: text('redirect_uris').array().notNull(),
    allowedScopes: text('allowed_scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('oauth_clients_app_idx').on(t.appId)],
);
export type OauthClient = typeof oauthClients.$inferSelect;
export type NewOauthClient = typeof oauthClients.$inferInsert;

/**
 * User-to-app consent records — one row per (user, app).
 */
export const oauthConsents = pgTable(
  'oauth_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    scope: text('scope').array().notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    unique('oauth_consents_user_app_unique').on(t.userId, t.appId),
    index('oauth_consents_user_idx').on(t.userId),
    index('oauth_consents_app_idx').on(t.appId),
  ],
);
export type OauthConsent = typeof oauthConsents.$inferSelect;

/**
 * Short-lived PKCE authorization codes. 60-second expiry.
 */
export const oauthAuthorizationCodes = pgTable(
  'oauth_authorization_codes',
  {
    code: text('code').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    scope: text('scope').array().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').default(false).notNull(),
  },
  (t) => [index('oauth_authorization_codes_expires_idx').on(t.expiresAt)],
);
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
