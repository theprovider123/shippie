/**
 * Maker layout — auth gate + slim shell data.
 *
 * Redirects to /auth/login if no session. Loads only what every maker page
 * needs: the user, a few recent apps for the sidebar, and at-a-glance counts.
 * It deliberately does NOT load the full app list — that would make a maker
 * with hundreds of apps slow on every page. The apps-list page owns the full
 * (paginated) query; feedback owns its own join.
 */
import { redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { claimTrialAppForMaker } from '$server/deploy/trial-claim';

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const user = locals.user;
  if (!platform?.env.DB) {
    return {
      user,
      recentApps: [] as MyAppRow[],
      counts: emptyCounts(),
      authStatus: authStatusFor(user, platform?.env?.SHIPPIE_ENV),
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
    if (claim.claimed) throw redirect(303, `/maker/apps/${encodeURIComponent(claim.slug)}`);
  }

  const owned = and(eq(schema.apps.makerId, user.id), eq(schema.apps.isArchived, false));

  const recentApps = await db
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
    .where(owned)
    .orderBy(desc(schema.apps.updatedAt))
    .limit(8);

  const [countRow] = await db
    .select({
      total: sql<number>`count(*)`,
      live: sql<number>`sum(case when ${schema.apps.latestDeployStatus} = 'success' then 1 else 0 end)`,
      privateApps: sql<number>`sum(case when ${schema.apps.visibilityScope} = 'private' then 1 else 0 end)`,
    })
    .from(schema.apps)
    .where(owned);

  return {
    user,
    recentApps,
    counts: {
      total: Number(countRow?.total ?? 0),
      live: Number(countRow?.live ?? 0),
      private: Number(countRow?.privateApps ?? 0),
    },
    authStatus: authStatusFor(user, platform.env.SHIPPIE_ENV),
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

export type MakerCounts = {
  total: number;
  live: number;
  private: number;
};

function emptyCounts(): MakerCounts {
  return { total: 0, live: 0, private: 0 };
}

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
