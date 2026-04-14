import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.ts';

/**
 * Organizations — multi-tenant primitives for business customers.
 * Apps may belong to an org or to an individual user (apps.organization_id is nullable).
 *
 * Spec v6 §15.1, §18.8.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan').default('free').notNull(),

  billingCustomerId: text('billing_customer_id'),
  verifiedBusiness: boolean('verified_business').default(false).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedDomain: text('verified_domain'),

  supportEmail: text('support_email'),
  privacyPolicyUrl: text('privacy_policy_url'),
  termsUrl: text('terms_url'),
  dataResidency: text('data_residency').default('eu').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

/**
 * Org membership with role asymmetry: account credentials are billing-sensitive
 * (owner/admin/billing_manager only); per-app signing configs are dev-lifecycle
 * (owner/admin/billing_manager/developer).
 *
 * Spec v6 §15.2.
 */
export const organizationMembers = pgTable(
  'organization_members',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export type OrganizationMember = typeof organizationMembers.$inferSelect;

export const organizationInvites = pgTable('organization_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type OrganizationInvite = typeof organizationInvites.$inferSelect;
