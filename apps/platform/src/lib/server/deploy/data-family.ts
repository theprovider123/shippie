/**
 * Stable data-family resolution.
 *
 * The data-passport family identifies an app's durable data shape so a remix
 * or successor can tell whether it can read the app's saved data. It must be
 * stable across an app's own deploys — including renames. It used to be
 * derived from the slug (defaultDataPassport), so a rename silently forked the
 * family. This locks the family on first deploy (apps.data_family) and reuses
 * it forever after; deliberate data migrations are a separate, explicit flow.
 */
import { eq } from 'drizzle-orm';
import type { ShippieDb } from '../db/client';
import { apps } from '../db/schema';

/**
 * Last-resort family when an app has neither a stored nor a declared family.
 * Derived from the immutable app id (never the slug) so it's rename-proof.
 */
export function fallbackDataFamily(appId: string): string {
  const token = appId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
  return token ? `app-${token}` : 'local-tool';
}

/**
 * Resolve the durable data family for an app, locking it on first deploy.
 *
 * Priority:
 *  1. The already-locked `apps.data_family` (set on a prior deploy) — wins so
 *     renames never shift it.
 *  2. The family the maker/manifest declares on THIS (first) deploy.
 *  3. An app-id-derived fallback (rename-proof).
 *
 * The resolved value is persisted to `apps.data_family` when not already set.
 */
export async function resolveStableDataFamily(
  db: ShippieDb,
  appId: string,
  declaredFamily: string | null | undefined,
): Promise<string> {
  const [row] = await db
    .select({ dataFamily: apps.dataFamily })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);
  if (row?.dataFamily) return row.dataFamily;

  const declared = typeof declaredFamily === 'string' ? declaredFamily.trim() : '';
  const family = declared || fallbackDataFamily(appId);
  await db.update(apps).set({ dataFamily: family }).where(eq(apps.id, appId));
  return family;
}
