/**
 * Load the reserved_slugs set from D1 for preflight to check against.
 * Per-request, no caching — Workers are stateless and the table is small.
 */
import type { D1Database } from '@cloudflare/workers-types';

export async function loadReservedSlugs(db: D1Database): Promise<ReadonlySet<string>> {
  const rs = await db.prepare('SELECT slug FROM reserved_slugs').all<{ slug: string }>();
  return new Set((rs.results ?? []).map((r) => r.slug));
}
