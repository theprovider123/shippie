import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

/**
 * User abuse reports for published apps. The primary organic safety signal
 * on an open, no-pre-review platform: any visitor (signed-in or anonymous)
 * can flag an app, and admins triage from /admin/reports — with a one-click
 * suspend that drives the Phase-1 takedown path.
 *
 * `reason` is a small closed set (see REPORT_REASONS); `status` moves
 * open → reviewing → actioned | dismissed.
 */
export const appReports = sqliteTable(
  'app_reports',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    reporterUserId: text('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    detail: text('detail'),
    status: text('status').notNull().default('open'),
    moderationFlags: text('moderation_flags', { mode: 'json' }).$type<string[]>(),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('app_reports_status_created_idx').on(t.status, t.createdAt),
    index('app_reports_app_idx').on(t.appId, t.createdAt),
  ],
);
