import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';
import { deploys } from './deploys';

export const appExternalDomains = sqliteTable(
  'app_external_domains',
  {
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    deployId: text('deploy_id')
      .notNull()
      .references(() => deploys.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    source: text('source').notNull(),
    allowed: integer('allowed', { mode: 'boolean' }).notNull(),
    firstSeenAt: text('first_seen_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.deployId, t.domain] })],
);
export type AppExternalDomain = typeof appExternalDomains.$inferSelect;
