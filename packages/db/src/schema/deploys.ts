import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

/**
 * Deploys — per-version source of truth for deploy state.
 *
 * The status column carries the per-version state including `needs_secrets`,
 * which is the same row reused on retry (Fix v5.1.1 D).
 *
 * `apps.latest_deploy_id` / `apps.latest_deploy_status` are derived from
 * the most recent deploy row via the sync_app_latest_deploy trigger.
 *
 * Spec v6 §10.1, §18.3.
 */
export const deploys = pgTable(
  'deploys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    commitSha: text('commit_sha'),
    sourceType: text('source_type').notNull(),

    /** Snapshot of shippie.json at deploy time — useful for forensics + rollback. */
    shippieJson: jsonb('shippie_json'),
    changelog: text('changelog'),

    /** 'building' | 'needs_secrets' | 'success' | 'failed' */
    status: text('status').default('building').notNull(),

    buildLog: text('build_log'),
    preflightStatus: text('preflight_status'),
    preflightReport: jsonb('preflight_report'),
    autopackagingStatus: text('autopackaging_status'),
    autopackagingReport: jsonb('autopackaging_report'),

    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),

    /** Per-app CSP header built by the trust pipeline at deploy time.
     *  Persisted so rollback can restore the KV `apps:{slug}:csp` entry.
     *  Null for pre-0014 rows. See migrations/0014_deploy_csp_header.sql. */
    cspHeader: text('csp_header'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('deploys_app_version_unique').on(t.appId, t.version),
    index('deploys_app_created_idx').on(t.appId, t.createdAt.desc()),
  ],
);

export type Deploy = typeof deploys.$inferSelect;
export type NewDeploy = typeof deploys.$inferInsert;

/**
 * Built artifact metadata — file list, hashes, R2 prefix.
 */
export const deployArtifacts = pgTable('deploy_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  deployId: uuid('deploy_id')
    .notNull()
    .references(() => deploys.id, { onDelete: 'cascade' }),
  r2Prefix: text('r2_prefix').notNull(),
  fileCount: integer('file_count').notNull(),
  totalBytes: bigint('total_bytes', { mode: 'bigint' }).notNull(),
  manifest: jsonb('manifest').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DeployArtifact = typeof deployArtifacts.$inferSelect;
