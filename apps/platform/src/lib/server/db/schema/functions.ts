import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { deploys } from './deploys';
import { users } from './users';

export const functionDeployments = sqliteTable(
  'function_deployments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    deployId: text('deploy_id').references(() => deploys.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    workerName: text('worker_name'),
    bundleHash: text('bundle_hash').notNull(),
    bundleR2Key: text('bundle_r2_key').notNull(),
    allowedDomains: text('allowed_domains', { mode: 'json' })
      .$type<string[]>()
      .default(sql`('[]')`)
      .notNull(),
    envSchema: text('env_schema', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default(sql`('{}')`)
      .notNull(),
    deployedAt: text('deployed_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    uniqueIndex('function_deployments_app_name_unique').on(t.appId, t.name),
    index('function_deployments_app_idx').on(t.appId),
  ],
);
export type FunctionDeployment = typeof functionDeployments.$inferSelect;

export const functionSecrets = sqliteTable(
  'function_secrets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    uniqueIndex('function_secrets_app_key_unique').on(t.appId, t.key),
    index('function_secrets_app_idx').on(t.appId),
  ],
);
export type FunctionSecret = typeof functionSecrets.$inferSelect;

export const functionLogs = sqliteTable(
  'function_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    functionName: text('function_name').notNull(),
    method: text('method').notNull(),
    status: integer('status'),
    durationMs: integer('duration_ms'),
    cpuTimeMs: integer('cpu_time_ms'),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    error: text('error'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('function_logs_app_created_idx').on(t.appId, t.createdAt),
    index('function_logs_name_idx').on(t.appId, t.functionName, t.createdAt),
  ],
);
export type FunctionLog = typeof functionLogs.$inferSelect;
