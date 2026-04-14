import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Slugs that cannot be claimed by makers. Seeded with system reserved
 * names + known brand trademarks. Admin can add to this list at runtime.
 *
 * Spec v6 §18.2.
 */
export const reservedSlugs = pgTable('reserved_slugs', {
  slug: text('slug').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ReservedSlug = typeof reservedSlugs.$inferSelect;

/**
 * Initial seed list. The 0001 migration inserts these at table creation.
 * Add to the migration directly when adding new system reserved names.
 */
export const RESERVED_SLUGS_SEED: ReadonlyArray<{ slug: string; reason: string }> = [
  // Platform infrastructure
  { slug: 'shippie', reason: 'system' },
  { slug: 'www', reason: 'system' },
  { slug: 'api', reason: 'system' },
  { slug: 'cdn', reason: 'system' },
  { slug: 'admin', reason: 'system' },
  { slug: 'mail', reason: 'system' },
  { slug: 'docs', reason: 'system' },
  { slug: 'help', reason: 'system' },
  { slug: 'status', reason: 'system' },
  { slug: 'blog', reason: 'system' },
  { slug: 'about', reason: 'system' },
  { slug: 'app', reason: 'system' },
  { slug: 'apps', reason: 'system' },
  { slug: 'trust', reason: 'system' },
  { slug: 'dashboard', reason: 'system' },
  { slug: 'security', reason: 'system' },
  { slug: 'support', reason: 'system' },
  { slug: 'pricing', reason: 'system' },
  { slug: 'login', reason: 'system' },
  { slug: 'signup', reason: 'system' },
  { slug: 'signin', reason: 'system' },
  { slug: 'logout', reason: 'system' },
  { slug: 'oauth', reason: 'system' },
  { slug: 'auth', reason: 'system' },
  { slug: 'webhooks', reason: 'system' },
  { slug: 'webhook', reason: 'system' },
  { slug: 'cron', reason: 'system' },
  { slug: 'internal', reason: 'system' },
  { slug: 'preview', reason: 'system' },
  { slug: 'staging', reason: 'system' },
  { slug: 'test', reason: 'system' },
  { slug: 'new', reason: 'system' },

  // Brand impersonation guard (representative; expand over time)
  { slug: 'apple', reason: 'brand' },
  { slug: 'google', reason: 'brand' },
  { slug: 'microsoft', reason: 'brand' },
  { slug: 'amazon', reason: 'brand' },
  { slug: 'meta', reason: 'brand' },
  { slug: 'facebook', reason: 'brand' },
  { slug: 'instagram', reason: 'brand' },
  { slug: 'twitter', reason: 'brand' },
  { slug: 'tiktok', reason: 'brand' },
  { slug: 'openai', reason: 'brand' },
  { slug: 'anthropic', reason: 'brand' },
  { slug: 'stripe', reason: 'brand' },
  { slug: 'github', reason: 'brand' },
  { slug: 'vercel', reason: 'brand' },
  { slug: 'cloudflare', reason: 'brand' },
];
