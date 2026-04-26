import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { users } from './users';

/**
 * Deploys — per-version source of truth for deploy state.
 * D1/SQLite port of packages/db/src/schema/deploys.ts.
 */
export const deploys = sqliteTable(
  'deploys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    commitSha: text('commit_sha'),
    sourceType: text('source_type').notNull(),

    shippieJson: text('shippie_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    changelog: text('changelog'),

    /** 'building' | 'needs_secrets' | 'success' | 'failed' */
    status: text('status').default('building').notNull(),

    buildLog: text('build_log'),
    preflightStatus: text('preflight_status'),
    preflightReport: text('preflight_report', { mode: 'json' }).$type<Record<string, unknown>>(),
    autopackagingStatus: text('autopackaging_status'),
    autopackagingReport: text('autopackaging_report', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),

    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),

    sourceKind: text('source_kind'),
    sourceRef: text('source_ref'),

    cspHeader: text('csp_header'),

    /**
     * App Kinds profile JSON for this deploy version (docs/app-kinds.md).
     * Stored as JSON for evolution flexibility. The denormalized current
     * kind on `apps` mirrors the latest successful deploy's value.
     */
    kindProfileJson: text('kind_profile_json', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),

    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    completedAt: text('completed_at'),
    createdBy: text('created_by').references(() => users.id),
  },
  (t) => [
    uniqueIndex('deploys_app_version_unique').on(t.appId, t.version),
    index('deploys_app_created_idx').on(t.appId, t.createdAt),
  ],
);

export type Deploy = typeof deploys.$inferSelect;
export type NewDeploy = typeof deploys.$inferInsert;

export const deployArtifacts = sqliteTable('deploy_artifacts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  deployId: text('deploy_id')
    .notNull()
    .references(() => deploys.id, { onDelete: 'cascade' }),
  r2Prefix: text('r2_prefix').notNull(),
  fileCount: integer('file_count').notNull(),
  /** D1 ints are 64-bit; bigint maps cleanly. */
  totalBytes: integer('total_bytes').notNull(),
  manifest: text('manifest', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

export type DeployArtifact = typeof deployArtifacts.$inferSelect;
