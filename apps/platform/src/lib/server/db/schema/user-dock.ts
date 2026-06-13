import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Account-scoped Dock — the saved tools that follow a signed-in user
 * across devices. The local launcher-memory (localStorage) stays the
 * instant, offline source of truth; this table mirrors saves so a fresh
 * device shows "my tools" right after sign-in.
 *
 * `removedAt` is a tombstone, not a delete: a removal on one device must
 * propagate to others (which still hold the slug locally) without a stale
 * offline device resurrecting it on its next sync. A re-save upserts the
 * row with `removedAt = NULL`, so save/remove is last-write-wins per slug.
 * Recents, launch counts, and offline capsules stay per-device.
 */
export const userDock = sqliteTable(
  'user_dock',
  {
    userId: text('user_id').notNull(),
    appSlug: text('app_slug').notNull(),
    /** ISO timestamp; order is most-recently-saved first. */
    savedAt: text('saved_at').default(sql`(datetime('now'))`).notNull(),
    /** NULL = active. Set = tombstoned (removed). */
    removedAt: text('removed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.appSlug] }),
    index('user_dock_user').on(t.userId),
  ],
);
