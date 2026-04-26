import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

export const appAccess = sqliteTable(
  'app_access',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    invitedBy: text('invited_by').references(() => users.id),
    grantedAt: text('granted_at').default(sql`(datetime('now'))`).notNull(),
    revokedAt: text('revoked_at'),
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
