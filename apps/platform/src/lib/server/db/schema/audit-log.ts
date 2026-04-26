import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Append-only audit log. INSERT-only by design.
 *
 * D1/SQLite port. `metadata` is JSON-typed text (Drizzle auto-handles
 * stringify/parse via mode: 'json').
 *
 * Spec v6 §15.1, §18.8.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id').references(() => organizations.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    ipHash: text('ip_hash'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [index('audit_log_org_created_idx').on(t.organizationId, t.createdAt)],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
