import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { deploys } from './deploys.ts';

/**
 * Declared + discovered outbound domains for a deploy. The compliance
 * runner populates this from static analysis; the privacy manifest
 * generator reads it to decide which domains appear in iOS tracking
 * declarations and Android data sharing.
 *
 * Spec v6 §14.4.
 */
export const appExternalDomains = pgTable(
  'app_external_domains',
  {
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    deployId: uuid('deploy_id')
      .notNull()
      .references(() => deploys.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    source: text('source').notNull(), // 'html' | 'js' | 'function' | 'manifest'
    allowed: boolean('allowed').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.deployId, t.domain] })],
);
export type AppExternalDomain = typeof appExternalDomains.$inferSelect;
