/**
 * app_access — per-app allow-list rows for private apps.
 *
 * One row grants (app_id, user_id | email) access. `source` marks how the
 * grant was created: 'owner' auto-rows for the maker, 'invite_link' claims
 * via shared link, 'invite_email' direct email invites. `revoked_at` is
 * set when access is pulled — queries filter on `where revoked_at is null`.
 *
 * Spec: docs/superpowers/plans/2026-04-23-private-apps-and-invites.md §Task 1
 */
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps.ts';
import { users } from './users.ts';

export const appAccess = pgTable(
  'app_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    invitedBy: uuid('invited_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    source: text('source').notNull(),
  },
  (t) => [
    index('app_access_app_active_idx').on(t.appId),
    check(
      'app_access_user_or_email',
      sql`${t.userId} is not null or ${t.email} is not null`,
    ),
  ],
);

export type AppAccess = typeof appAccess.$inferSelect;
export type NewAppAccess = typeof appAccess.$inferInsert;
