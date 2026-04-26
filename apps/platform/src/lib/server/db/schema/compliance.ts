import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { deploys } from './deploys';
import { users } from './users';

export const complianceChecks = sqliteTable(
  'compliance_checks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    checkType: text('check_type').notNull(),
    status: text('status').notNull(),
    evidence: text('evidence', { mode: 'json' }).$type<Record<string, unknown>>(),
    checkedAt: text('checked_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('compliance_checks_app_platform_idx').on(t.appId, t.platform),
    index('compliance_checks_app_type_idx').on(t.appId, t.checkType),
  ],
);
export type ComplianceCheckRow = typeof complianceChecks.$inferSelect;
export type NewComplianceCheckRow = typeof complianceChecks.$inferInsert;

export const privacyManifests = sqliteTable(
  'privacy_manifests',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    deployId: text('deploy_id').references(() => deploys.id, { onDelete: 'set null' }),
    collectedData: text('collected_data', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    accessedApis: text('accessed_apis', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    trackingEnabled: integer('tracking_enabled', { mode: 'boolean' }).default(false).notNull(),
    trackingDomains: text('tracking_domains', { mode: 'json' }).$type<string[]>(),
    dataSafetyAndroid: text('data_safety_android', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    generatedAt: text('generated_at').default(sql`(datetime('now'))`).notNull(),
    source: text('source'),
  },
  (t) => [index('privacy_manifests_app_idx').on(t.appId, t.generatedAt)],
);
export type PrivacyManifest = typeof privacyManifests.$inferSelect;

export const accountDeletionRequests = sqliteTable(
  'account_deletion_requests',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestedAt: text('requested_at').default(sql`(datetime('now'))`).notNull(),
    gracePeriodEndsAt: text('grace_period_ends_at').notNull(),
    confirmedAt: text('confirmed_at'),
    executedAt: text('executed_at'),
    cancelledAt: text('cancelled_at'),
  },
  (t) => [uniqueIndex('account_deletion_unique').on(t.appId, t.userId)],
);
export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;
