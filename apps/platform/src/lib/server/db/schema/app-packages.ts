import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { deploys } from './deploys';

/**
 * Portable package records for the container commons runtime.
 *
 * The actual package metadata is stored as static R2 artifacts beside the
 * deploy report. These rows denormalize the query-critical fields so the
 * platform, MCP, CLI, and future Hub mirror can find a package without
 * parsing every artifact in the hot path.
 */
export const appPackages = sqliteTable(
  'app_packages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    deployId: text('deploy_id')
      .notNull()
      .references(() => deploys.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    channel: text('channel').default('stable').notNull(),
    packageHash: text('package_hash').notNull(),
    artifactPrefix: text('artifact_prefix').notNull(),
    manifestPath: text('manifest_path').notNull(),
    permissionsPath: text('permissions_path').notNull(),
    trustReportPath: text('trust_report_path').notNull(),
    sourcePath: text('source_path').notNull(),
    deployReportPath: text('deploy_report_path'),
    containerEligibility: text('container_eligibility').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    uniqueIndex('app_packages_deploy_unique').on(t.deployId),
    uniqueIndex('app_packages_hash_unique').on(t.packageHash),
    index('app_packages_app_created_idx').on(t.appId, t.createdAt),
    index('app_packages_container_idx').on(t.containerEligibility),
  ],
);

export type AppPackage = typeof appPackages.$inferSelect;
export type NewAppPackage = typeof appPackages.$inferInsert;

/**
 * Source/remix ownership record for an app. This stays app-level because
 * lineage is about the maker's project, while package records are versioned.
 */
export const appLineage = sqliteTable('app_lineage', {
  appId: text('app_id')
    .primaryKey()
    .references(() => apps.id, { onDelete: 'cascade' }),
  templateId: text('template_id'),
  parentAppId: text('parent_app_id').references(() => apps.id, { onDelete: 'set null' }),
  parentVersion: text('parent_version'),
  sourceRepo: text('source_repo'),
  license: text('license'),
  remixAllowed: integer('remix_allowed', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
});

export type AppLineage = typeof appLineage.$inferSelect;
export type NewAppLineage = typeof appLineage.$inferInsert;
