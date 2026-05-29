import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { curatedAppsBySurface } from '$lib/container/state';
import { normalizeCategory } from '$lib/curation/schema';
import { isFirstPartyShowcase } from '$lib/showcase-slugs';
import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';
import { getDrizzleClient, schema } from '$server/db/client';
import { browsePublic } from '$server/db/queries/apps';

const CATALOG_LIMIT = 120;

function fallbackApps() {
  return [...curatedAppsBySurface('featured'), ...curatedAppsBySurface('arcade')].map((app) => ({
    id: app.id,
    slug: app.slug,
    name: app.name,
    tagline: app.description,
    description: app.description,
    type: 'app',
    category: normalizeCategory(app.category),
    iconUrl: null,
    themeColor: app.accent,
    upvoteCount: 0,
    installCount: 0,
    compatibilityScore: 100,
    currentDetectedKind: app.appKind,
    currentPublicKindStatus: 'confirmed',
    kind: app.appKind as AppKind,
    kindStatus: 'confirmed' as PublicKindStatus,
    firstPartySigned: true,
  }));
}

const isAppKind = (value: string | null): value is AppKind =>
  value === 'local' || value === 'connected' || value === 'cloud';

export const load: PageServerLoad = async ({ parent, platform, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });

  const { user } = await parent();
  const bundled = fallbackApps();

  if (!platform?.env.DB) {
    return {
      apps: bundled,
      user,
      makerApps: [],
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  try {
    const [publicRows, makerApps] = await Promise.all([
      browsePublic(db, { limit: CATALOG_LIMIT, offset: 0 }),
      user
        ? db
            .select({
              id: schema.apps.id,
              slug: schema.apps.slug,
              name: schema.apps.name,
              themeColor: schema.apps.themeColor,
              latestDeployStatus: schema.apps.latestDeployStatus,
              visibilityScope: schema.apps.visibilityScope,
              updatedAt: schema.apps.updatedAt,
            })
            .from(schema.apps)
            .where(eq(schema.apps.makerId, user.id))
            .orderBy(desc(schema.apps.updatedAt))
        : Promise.resolve([]),
    ]);

    const seen = new Set(publicRows.map((app) => app.slug));
    const apps = [
      ...publicRows.map((app) => ({
        ...app,
        kind: isAppKind(app.currentDetectedKind) ? app.currentDetectedKind : null,
        kindStatus: (app.currentPublicKindStatus ?? null) as PublicKindStatus | null,
        firstPartySigned: isFirstPartyShowcase(app.slug),
      })),
      ...bundled.filter((app) => !seen.has(app.slug)),
    ];

    return {
      apps,
      user,
      makerApps,
    };
  } catch {
    return {
      apps: bundled,
      user,
      makerApps: [],
    };
  }
};
