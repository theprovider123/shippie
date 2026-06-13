/**
 * Account-scoped Dock — server reads/writes for the cross-device saved
 * tools mirror. localStorage stays the instant local truth; this lets a
 * fresh device hydrate "my tools" after sign-in. See schema/user-dock.ts.
 */
import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import type { ShippieDb } from '$server/db/client';
import { schema } from '$server/db/client';

export interface AccountDockState {
  /** Active saved slugs, most-recently-saved first. */
  saved: string[];
  /** Tombstoned slugs — removed on some device; clients subtract these. */
  removed: string[];
}

export async function listAccountDock(db: ShippieDb, userId: string): Promise<AccountDockState> {
  const rows = await db
    .select({
      slug: schema.userDock.appSlug,
      removedAt: schema.userDock.removedAt,
      savedAt: schema.userDock.savedAt,
    })
    .from(schema.userDock)
    .where(eq(schema.userDock.userId, userId))
    .orderBy(desc(schema.userDock.savedAt));
  const saved: string[] = [];
  const removed: string[] = [];
  for (const row of rows) {
    if (row.removedAt) removed.push(row.slug);
    else saved.push(row.slug);
  }
  return { saved, removed };
}

export type AccountDockAction = 'save' | 'remove';

/**
 * Save = upsert active (clears any tombstone — a re-save wins).
 * Remove = upsert a tombstone so the removal propagates to other devices
 * that still hold the slug locally. Last write wins per (user, slug).
 */
export async function setAccountDockEntry(
  db: ShippieDb,
  userId: string,
  slug: string,
  action: AccountDockAction,
): Promise<void> {
  const now = new Date().toISOString();
  if (action === 'save') {
    await db
      .insert(schema.userDock)
      .values({ userId, appSlug: slug, savedAt: now, removedAt: null })
      .onConflictDoUpdate({
        target: [schema.userDock.userId, schema.userDock.appSlug],
        set: { savedAt: now, removedAt: null },
      });
    return;
  }
  await db
    .insert(schema.userDock)
    .values({ userId, appSlug: slug, savedAt: now, removedAt: now })
    .onConflictDoUpdate({
      target: [schema.userDock.userId, schema.userDock.appSlug],
      set: { removedAt: now },
    });
}

/** Active saved-slug count for an account (cheap; used by tests/UI). */
export async function countAccountDockSaved(db: ShippieDb, userId: string): Promise<number> {
  const rows = await db
    .select({ slug: schema.userDock.appSlug })
    .from(schema.userDock)
    .where(and(eq(schema.userDock.userId, userId), isNull(schema.userDock.removedAt)));
  return rows.length;
}

/** Tombstone count — exposed for a future GC cron (prune old removals). */
export async function countAccountDockTombstones(db: ShippieDb, userId: string): Promise<number> {
  const rows = await db
    .select({ slug: schema.userDock.appSlug })
    .from(schema.userDock)
    .where(and(eq(schema.userDock.userId, userId), isNotNull(schema.userDock.removedAt)));
  return rows.length;
}
