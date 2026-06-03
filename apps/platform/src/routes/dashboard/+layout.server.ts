/**
 * Dashboard layout — auth gate + sidebar data.
 *
 * Redirects to /auth/login if no session. Loads the maker's apps once
 * for the sidebar so child routes can read it from `data.myApps`
 * without re-querying.
 */
import { redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { claimTrialAppForMaker } from '$server/deploy/trial-claim';

const DEMO_APP_SLUGS = [
  'market-demo',
  'race-demo',
  'restaurant-demo',
  'wedding-demo',
  'corporate-demo',
  'docklands',
] as const;

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const user = locals.user;
  if (!platform?.env.DB) {
    return {
      user,
      myApps: [] as MyAppRow[],
      authStatus: authStatusFor(user, platform?.env?.SHIPPIE_ENV),
      demoDiagnostics: emptyDemoDiagnostics(),
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const claimTrialSlug = url.searchParams.get('claim_trial')?.trim();
  if (claimTrialSlug) {
    const claim = await claimTrialAppForMaker({
      db,
      slug: claimTrialSlug,
      makerId: user.id,
    });
    if (claim.claimed) throw redirect(303, `/dashboard/apps/${encodeURIComponent(claim.slug)}`);
  }

  const myApps = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      type: schema.apps.type,
      themeColor: schema.apps.themeColor,
      latestDeployStatus: schema.apps.latestDeployStatus,
      visibilityScope: schema.apps.visibilityScope,
      lastDeployedAt: schema.apps.lastDeployedAt,
    })
    .from(schema.apps)
    .where(and(eq(schema.apps.makerId, user.id), eq(schema.apps.isArchived, false)))
    .orderBy(desc(schema.apps.updatedAt));

  const demoRows = await db
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

  const foundSlugs = new Set(demoRows.map((row) => row.slug));
  return {
    user,
    myApps,
    authStatus: authStatusFor(user, platform.env.SHIPPIE_ENV),
    demoDiagnostics: {
      expectedSlugs: [...DEMO_APP_SLUGS],
      missingSlugs: DEMO_APP_SLUGS.filter((slug) => !foundSlugs.has(slug)),
      rows: demoRows,
      ownedSlugs: demoRows.filter((row) => row.makerId === user.id && !row.isArchived).map((row) => row.slug),
      otherOwnerSlugs: demoRows.filter((row) => row.makerId !== user.id).map((row) => row.slug),
      archivedSlugs: demoRows.filter((row) => row.isArchived).map((row) => row.slug),
    },
  };
};

export type MyAppRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  themeColor: string;
  latestDeployStatus: string | null;
  visibilityScope: string;
  lastDeployedAt: string | null;
};

function authStatusFor(
  user: { id: string; email: string; isAdmin: boolean },
  env: string | undefined,
) {
  return {
    userId: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    environment: env ?? 'development',
    sessionDays: 30,
  };
}

function emptyDemoDiagnostics() {
  return {
    expectedSlugs: [...DEMO_APP_SLUGS],
    missingSlugs: [...DEMO_APP_SLUGS],
    rows: [] as Array<{
      slug: string;
      name: string;
      makerId: string;
      visibilityScope: string;
      isArchived: boolean;
      latestDeployStatus: string | null;
    }>,
    ownedSlugs: [] as string[],
    otherOwnerSlugs: [] as string[],
    archivedSlugs: [] as string[],
  };
}
