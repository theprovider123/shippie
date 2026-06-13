import { eq, inArray } from 'drizzle-orm';
import type { ShippieDb } from '$server/db/client';
import { schema } from '$server/db/client';
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';

/**
 * The renderable arcade allowlist: first-party games baked with
 * curation.surface='arcade' in their shippie.json (incl. docklands).
 * Derived from generated curation so it auto-syncs with source manifests
 * and never includes a slug the cabinet has no metadata to render.
 */
export function bakedArcadeGameSlugs(): ReadonlySet<string> {
  return new Set(
    FIRST_PARTY_CURATION.filter((e) => e.surface === 'arcade').map((e) => e.slug),
  );
}

export interface ArcadeAppRow {
  slug: string;
  surface: string;
  visibilityScope: string;
  isArchived: boolean;
  suspendedAt: string | null;
}

export interface ArcadeRoster {
  enabled: string[];
  blocked: string[];
}

/** Pure split of D1 rows into the cabinet's enabled + blocked sets. */
export function partitionRoster(
  rows: ArcadeAppRow[],
  baked: ReadonlySet<string>,
): ArcadeRoster {
  const enabled: string[] = [];
  const blocked: string[] = [];
  for (const r of rows) {
    if (!baked.has(r.slug)) continue;
    const suspendedOrDown = r.suspendedAt !== null || r.isArchived;
    if (suspendedOrDown) {
      blocked.push(r.slug);
      continue;
    }
    if (r.surface === 'arcade' && r.visibilityScope === 'public') {
      enabled.push(r.slug);
    }
  }
  return { enabled, blocked };
}

/** D1-first roster load. No KV in v1 (stale KV is exactly how leaks happen). */
export async function loadArcadeRoster(db: ShippieDb): Promise<ArcadeRoster> {
  const baked = bakedArcadeGameSlugs();
  if (baked.size === 0) return { enabled: [], blocked: [] };
  const rows = await db
    .select({
      slug: schema.apps.slug,
      surface: schema.apps.surface,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      suspendedAt: schema.apps.suspendedAt,
    })
    .from(schema.apps)
    .where(inArray(schema.apps.slug, [...baked]));
  return partitionRoster(rows as ArcadeAppRow[], baked);
}

/** Shared by /run routing and the roster endpoint so they never disagree. */
export async function isEnabledInArcade(db: ShippieDb, slug: string): Promise<boolean> {
  const baked = bakedArcadeGameSlugs();
  if (!baked.has(slug)) return false;
  const [row] = await db
    .select({
      surface: schema.apps.surface,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      suspendedAt: schema.apps.suspendedAt,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!row) return false;
  return (
    row.surface === 'arcade' &&
    row.visibilityScope === 'public' &&
    !row.isArchived &&
    row.suspendedAt === null
  );
}
