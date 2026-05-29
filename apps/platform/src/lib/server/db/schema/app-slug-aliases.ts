import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps';

/**
 * Slug aliases for third-party app renames.
 *
 * First-party showcase aliases are hardcoded in `showcase-slugs.ts` (they
 * change rarely and need zero-DB resolution on hot subdomain paths). Maker
 * apps, however, can rename freely — and before this table a rename left every
 * old `/apps/:old` / `/run/:old` link, bookmark, and installed-PWA entry point
 * 404ing. Each row maps a retired slug → the app's current slug so resolution
 * can 302 instead of 404.
 *
 * Invariant maintained by the rename action: every alias row for an app points
 * at that app's CURRENT slug (chains are flattened, not followed), and the
 * live slug never appears as an alias (no redirect loops).
 */
export const appSlugAliases = sqliteTable(
  'app_slug_aliases',
  {
    /** The retired slug being aliased (the thing users may still hit). */
    slug: text('slug').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    /** The app's current canonical slug to redirect to. */
    targetSlug: text('target_slug').notNull(),
    reason: text('reason').notNull().default('rename'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    retiredAt: text('retired_at'),
  },
  (table) => ({
    appIdIdx: index('app_slug_aliases_app_id_idx').on(table.appId),
  }),
);

export type AppSlugAlias = typeof appSlugAliases.$inferSelect;
