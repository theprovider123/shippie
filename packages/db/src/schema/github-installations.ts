import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';
import { organizations } from './organizations.ts';

/**
 * Per-user GitHub App installations.
 *
 * Populated by /api/github/install/callback after the user completes the
 * "Install Shippie" flow on github.com. Consumed by the webhook and repo
 * picker to mint installation tokens and list accessible repos.
 *
 * See migration 0013.
 */
export const githubInstallations = pgTable(
  'github_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubInstallationId: bigint('github_installation_id', { mode: 'number' })
      .notNull()
      .unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    accountLogin: text('account_login').notNull(),
    accountType: text('account_type').notNull(), // 'User' | 'Organization'
    repositorySelection: text('repository_selection').notNull(), // 'all' | 'selected'
    permissions: jsonb('permissions'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('github_installations_user_idx').on(t.userId),
    index('github_installations_org_idx').on(t.organizationId),
  ],
);

export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type NewGithubInstallation = typeof githubInstallations.$inferInsert;
