import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { appInvites } from './app-invites';
import { users } from './users';

export const spaces = sqliteTable(
  'spaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    status: text('status').default('active').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
    archivedAt: text('archived_at'),
    archiveReason: text('archive_reason'),
  },
  (t) => [
    index('spaces_created_by_idx').on(t.createdBy),
    index('spaces_status_idx').on(t.status),
  ],
);

export const spaceApps = sqliteTable(
  'space_apps',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    appSlug: text('app_slug').notNull(),
    packageHash: text('package_hash'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('space_apps_space_idx').on(t.spaceId),
    index('space_apps_app_idx').on(t.appId),
  ],
);

export const spaceJoinTokens = sqliteTable(
  'space_join_tokens',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    inviteId: text('invite_id')
      .notNull()
      .references(() => appInvites.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    maxClaims: integer('max_claims'),
    claimCount: integer('claim_count').default(0).notNull(),
    expiresAt: text('expires_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    revokedAt: text('revoked_at'),
    rotatedFrom: text('rotated_from').references((): AnySQLiteColumn => spaceJoinTokens.id),
  },
  (t) => [
    index('space_join_tokens_space_idx').on(t.spaceId),
    index('space_join_tokens_app_idx').on(t.appId),
    index('space_join_tokens_invite_idx').on(t.inviteId),
  ],
);

export const spaceAuditLog = sqliteTable(
  'space_audit_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    appId: text('app_id').references(() => apps.id, { onDelete: 'set null' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('space_audit_space_created_idx').on(t.spaceId, t.createdAt),
    index('space_audit_app_created_idx').on(t.appId, t.createdAt),
  ],
);

export type SpaceRow = typeof spaces.$inferSelect;
export type SpaceAppRow = typeof spaceApps.$inferSelect;
export type SpaceJoinTokenRow = typeof spaceJoinTokens.$inferSelect;
export type SpaceAuditLogRow = typeof spaceAuditLog.$inferSelect;
