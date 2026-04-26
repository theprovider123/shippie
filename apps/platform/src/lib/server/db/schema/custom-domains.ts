import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';

export const customDomains = sqliteTable(
  'custom_domains',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull().unique(),
    isCanonical: integer('is_canonical', { mode: 'boolean' }).notNull().default(false),
    verificationToken: text('verification_token').notNull(),
    verifiedAt: text('verified_at'),
    sslProvisioned: integer('ssl_provisioned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('custom_domains_app_idx').on(t.appId),
    index('custom_domains_domain_idx').on(t.domain),
  ],
);
