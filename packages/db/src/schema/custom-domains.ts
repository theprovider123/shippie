import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';

export const customDomains = pgTable(
  'custom_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull().unique(),
    isCanonical: boolean('is_canonical').notNull().default(false),
    verificationToken: text('verification_token').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    sslProvisioned: boolean('ssl_provisioned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('custom_domains_app_idx').on(t.appId),
    index('custom_domains_domain_idx').on(t.domain),
  ],
);
