import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

export const appInvites = sqliteTable(
  'app_invites',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    kind: text('kind').notNull(),
    email: text('email'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    expiresAt: text('expires_at'),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    revokedAt: text('revoked_at'),
  },
  (t) => [index('app_invites_app_active_idx').on(t.appId)],
);

export type AppInvite = typeof appInvites.$inferSelect;
export type NewAppInvite = typeof appInvites.$inferInsert;
