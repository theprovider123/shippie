import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Role } from '@shippie/cloudlet-contract';
import { privateAppInstances } from './private-app-instances';
import { users } from './users';

/**
 * cloudlet_memberships — who belongs to a school instance, and with what role.
 *
 * This is the Phase-2 replacement for the Phase-1A ownerEmail shortcut. Access
 * to a school's private workspace is granted by a VERIFIED membership row
 * (created on invite-accept), never by an unverified email match. `role` is one
 * of the 8 cloudlet roles from `@shippie/cloudlet-contract`.
 *
 * Tenancy key = (instance_id, user_id) — a user may belong to many schools,
 * but holds exactly one role row per school (composite PK).
 */
export const cloudletMemberships = sqliteTable(
  'cloudlet_memberships',
  {
    instanceId: text('instance_id')
      .notNull()
      .references(() => privateAppInstances.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<Role>(),
    /** Optional class-level scope (JSON array of class ids), Uniti-specific. */
    scope: text('scope', { mode: 'json' }).$type<{ classIds?: string[] }>(),
    invitedBy: text('invited_by').references(() => users.id),
    joinedAt: text('joined_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.instanceId, t.userId] }),
    index('cloudlet_memberships_user_idx').on(t.userId),
  ],
);

/**
 * cloudlet_invites — pending staff invitations (token+expiry pattern).
 *
 * Mirrors organizationInvites / spaceJoinTokens: only the token HASH is
 * stored; the raw token is delivered to the invitee and verified on accept.
 * Single-use: acceptance stamps accepted_at and creates a membership row.
 */
export const cloudletInvites = sqliteTable(
  'cloudlet_invites',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    instanceId: text('instance_id')
      .notNull()
      .references(() => privateAppInstances.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().$type<Role>(),
    scope: text('scope', { mode: 'json' }).$type<{ classIds?: string[] }>(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    acceptedBy: text('accepted_by').references(() => users.id),
    revokedAt: text('revoked_at'),
    invitedBy: text('invited_by').references(() => users.id),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('cloudlet_invites_instance_idx').on(t.instanceId),
    index('cloudlet_invites_email_idx').on(t.email),
    index('cloudlet_invites_token_idx').on(t.tokenHash),
  ],
);

export type CloudletMembershipRow = typeof cloudletMemberships.$inferSelect;
export type NewCloudletMembershipRow = typeof cloudletMemberships.$inferInsert;
export type CloudletInviteRow = typeof cloudletInvites.$inferSelect;
export type NewCloudletInviteRow = typeof cloudletInvites.$inferInsert;
