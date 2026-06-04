/**
 * Demo-app diagnostics for the maker surface.
 *
 * Dev-only helper that reports the state of the seeded demo apps. Kept out of
 * the maker layout load (which must stay slim for large accounts) — the home
 * and apps-list pages call this themselves, since they're the only consumers.
 */
import { inArray } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';

export const DEMO_APP_SLUGS = [
  'market-demo',
  'race-demo',
  'restaurant-demo',
  'wedding-demo',
  'corporate-demo',
  'docklands',
] as const;

export type DemoDiagnostics = {
  expectedSlugs: string[];
  missingSlugs: string[];
  rows: Array<{
    slug: string;
    name: string;
    makerId: string;
    visibilityScope: string;
    isArchived: boolean;
    latestDeployStatus: string | null;
  }>;
  ownedSlugs: string[];
  otherOwnerSlugs: string[];
  archivedSlugs: string[];
};

export function emptyDemoDiagnostics(): DemoDiagnostics {
  return {
    expectedSlugs: [...DEMO_APP_SLUGS],
    missingSlugs: [...DEMO_APP_SLUGS],
    rows: [],
    ownedSlugs: [],
    otherOwnerSlugs: [],
    archivedSlugs: [],
  };
}

export async function loadDemoDiagnostics(
  db: ShippieDb,
  userId: string,
): Promise<DemoDiagnostics> {
  const rows = await db
    .select({
      slug: schema.apps.slug,
      name: schema.apps.name,
      makerId: schema.apps.makerId,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      latestDeployStatus: schema.apps.latestDeployStatus,
    })
    .from(schema.apps)
    .where(inArray(schema.apps.slug, [...DEMO_APP_SLUGS]));

  const foundSlugs = new Set(rows.map((row) => row.slug));
  return {
    expectedSlugs: [...DEMO_APP_SLUGS],
    missingSlugs: DEMO_APP_SLUGS.filter((slug) => !foundSlugs.has(slug)),
    rows,
    ownedSlugs: rows.filter((row) => row.makerId === userId && !row.isArchived).map((row) => row.slug),
    otherOwnerSlugs: rows.filter((row) => row.makerId !== userId).map((row) => row.slug),
    archivedSlugs: rows.filter((row) => row.isArchived).map((row) => row.slug),
  };
}
