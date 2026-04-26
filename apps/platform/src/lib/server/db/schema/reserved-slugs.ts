import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const reservedSlugs = sqliteTable('reserved_slugs', {
  slug: text('slug').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
});

export type ReservedSlug = typeof reservedSlugs.$inferSelect;

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
  // Brand impersonation guard
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
