import { index, integer, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps.ts';
import { deploys } from './deploys.ts';
import { users } from './users.ts';

/**
 * Shippie Functions — per-app server capability.
 *
 * MVP runner is a locally-dispatched Node VM. The same table serves the
 * Cloudflare Workers for Platforms path: when `worker_name` is set, the
 * runtime dispatches to CFW4P instead of the local VM.
 *
 * Spec v6 §1 (functions).
 */
export const functionDeployments = pgTable(
  'function_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    deployId: uuid('deploy_id').references(() => deploys.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    workerName: text('worker_name'),
    bundleHash: text('bundle_hash').notNull(),
    bundleR2Key: text('bundle_r2_key').notNull(),
    allowedDomains: text('allowed_domains')
      .array()
      .default(sql`array[]::text[]`)
      .notNull(),
    envSchema: jsonb('env_schema').default(sql`'{}'::jsonb`).notNull(),
    deployedAt: timestamp('deployed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('function_deployments_app_name_unique').on(t.appId, t.name),
    index('function_deployments_app_idx').on(t.appId),
  ],
);
export type FunctionDeployment = typeof functionDeployments.$inferSelect;

export const functionSecrets = pgTable(
  'function_secrets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('function_secrets_app_key_unique').on(t.appId, t.key),
    index('function_secrets_app_idx').on(t.appId),
  ],
);
export type FunctionSecret = typeof functionSecrets.$inferSelect;

export const functionLogs = pgTable(
  'function_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    functionName: text('function_name').notNull(),
    method: text('method').notNull(),
    status: integer('status'),
    durationMs: integer('duration_ms'),
    cpuTimeMs: integer('cpu_time_ms'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    error: text('error'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('function_logs_app_created_idx').on(t.appId, t.createdAt),
    index('function_logs_name_idx').on(t.appId, t.functionName, t.createdAt),
  ],
);
export type FunctionLog = typeof functionLogs.$inferSelect;
