/**
 * Third-party slug-alias resolution + rename bookkeeping.
 *
 * First-party showcase aliases live in `showcase-slugs.ts` (sync, zero-DB).
 * This module is the DB-backed equivalent for maker app renames, kept out of
 * the route files so the rename invariant is testable in one place.
 *
 * Invariant: every alias row for an app points at the app's CURRENT slug
 * (chains are flattened, never followed at request time), and the live slug is
 * never itself an alias (no redirect loops).
 */
import { and, eq, ne } from 'drizzle-orm';
import type { ShippieDb } from './db/client';
import { appSlugAliases } from './db/schema';

/**
 * Resolve a retired slug to the app's current slug, or null if there's no
 * alias. One indexed PK lookup; callers should gate this to the not-found /
 * non-first-party path so valid requests don't pay for it.
 */
export async function resolveSlugAlias(db: ShippieDb, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ targetSlug: appSlugAliases.targetSlug })
    .from(appSlugAliases)
    .where(eq(appSlugAliases.slug, slug))
    .limit(1);
  if (!row) return null;
  // Defensive: never report an alias that points at itself.
  return row.targetSlug === slug ? null : row.targetSlug;
}

/**
 * Record a maker app rename, maintaining the alias invariant:
 *  1. Re-point any existing aliases for this app at the new slug (flatten chains).
 *  2. Insert/refresh the just-retired slug as an alias → new slug.
 *  3. Remove any alias sitting on the new slug so the now-live slug isn't shadowed.
 *
 * No-op when fromSlug === toSlug.
 */
export async function recordSlugRename(
  db: ShippieDb,
  input: { appId: string; fromSlug: string; toSlug: string; reason?: string },
): Promise<void> {
  const { appId, fromSlug, toSlug } = input;
  if (fromSlug === toSlug) return;

  // 1. Flatten existing aliases for this app onto the new canonical slug.
  await db
    .update(appSlugAliases)
    .set({ targetSlug: toSlug })
    .where(and(eq(appSlugAliases.appId, appId), ne(appSlugAliases.slug, toSlug)));

  // 2. Upsert the retired slug → new slug.
  await db
    .insert(appSlugAliases)
    .values({ slug: fromSlug, appId, targetSlug: toSlug, reason: input.reason ?? 'rename' })
    .onConflictDoUpdate({
      target: appSlugAliases.slug,
      set: { appId, targetSlug: toSlug, reason: input.reason ?? 'rename' },
    });

  // 3. The new live slug must not also be an alias (would loop).
  await db.delete(appSlugAliases).where(eq(appSlugAliases.slug, toSlug));
}
