import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * Organizations — multi-tenant primitives for business customers.
 *
 * Spec v6 §15.1, §18.8.
 */
export const organizations = sqliteTable('organizations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan').default('free').notNull(),

  billingCustomerId: text('billing_customer_id'),
  verifiedBusiness: integer('verified_business', { mode: 'boolean' }).default(false).notNull(),
  verifiedAt: text('verified_at'),
  verifiedDomain: text('verified_domain'),

  supportEmail: text('support_email'),
  privacyPolicyUrl: text('privacy_policy_url'),
  termsUrl: text('terms_url'),
  dataResidency: text('data_residency').default('eu').notNull(),

  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export const organizationMembers = sqliteTable(
  'organization_members',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: text('invited_by').references(() => users.id),
    joinedAt: text('joined_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export type OrganizationMember = typeof organizationMembers.$inferSelect;

export const organizationInvites = sqliteTable('organization_invites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  acceptedAt: text('accepted_at'),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

export type OrganizationInvite = typeof organizationInvites.$inferSelect;
