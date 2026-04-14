/**
 * Load the reserved_slugs set from Postgres for preflight to check
 * against. Cached in-memory for the lifetime of the Node process
 * (dev server) — the admin flow to add new reserved slugs at runtime
 * will need to invalidate this cache.
 */
import { getDb } from '@/lib/db';
import { schema } from '@shippie/db';

let cache: ReadonlySet<string> | null = null;

export async function loadReservedSlugs(): Promise<ReadonlySet<string>> {
  if (cache) return cache;
  const db = await getDb();
  const rows = await db.select({ slug: schema.reservedSlugs.slug }).from(schema.reservedSlugs);
  cache = new Set(rows.map((r) => r.slug));
  return cache;
}

/** Test/admin hook to bust the cache after inserting new reserved slugs. */
export function invalidateReservedSlugCache(): void {
  cache = null;
}
