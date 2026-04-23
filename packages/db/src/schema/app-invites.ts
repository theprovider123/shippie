/**
 * app_invites — maker-issued invite tokens for private apps.
 *
 * `kind='link'` is a shareable, optionally multi-use token; `kind='email'`
 * is a direct invite bound to one address. `token` is the HMAC-signed
 * string embedded in the claim URL. `used_count` / `max_uses` gate multi-use
 * links; `revoked_at` hard-kills a token.
 *
 * Spec: docs/superpowers/plans/2026-04-23-private-apps-and-invites.md §Task 1
 */
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

export const appInvites = pgTable(
  'app_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    kind: text('kind').notNull(),
    email: text('email'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('app_invites_app_active_idx').on(t.appId)],
);

export type AppInvite = typeof appInvites.$inferSelect;
export type NewAppInvite = typeof appInvites.$inferInsert;
