import { and, desc, eq, inArray } from 'drizzle-orm';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { AppPackageManifest, AppPermissions, TrustReport } from '@shippie/app-package-contract';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export type ContainerPackageSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | undefined;
  appKind: AppPackageManifest['kind'];
  entry: string;
  version: string;
  packageHash: string;
  standaloneUrl: string;
  permissions: AppPermissions;
  trust: Pick<TrustReport, 'containerEligibility' | 'privacy' | 'security'>;
};

export const load: PageServerLoad = async ({ platform, url }) => {
  const requestedAppSlug = url.searchParams.get('app');
  // Focused mode is the unification plan's "invisible chrome" view.
  // /run/<slug>/ redirects here with `focused=1`. The page hides the
  // sidebar, topbar, and section tabs and renders the requested app
  // full-bleed with the AppSwitcherGesture for switching.
  const focused = url.searchParams.get('focused') === '1';

  if (!platform?.env.DB || !platform.env.APPS) {
    return {
      packages: [] as ContainerPackageSummary[],
      requestedAppSlug,
      focused,
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  let rows: Array<{
    packageHash: string;
    version: string;
    manifestPath: string;
    permissionsPath: string;
    trustReportPath: string;
    createdAt: string;
  }>;
  try {
    rows = await db
      .select({
        packageHash: schema.appPackages.packageHash,
        version: schema.appPackages.version,
        manifestPath: schema.appPackages.manifestPath,
        permissionsPath: schema.appPackages.permissionsPath,
        trustReportPath: schema.appPackages.trustReportPath,
        createdAt: schema.appPackages.createdAt,
      })
      .from(schema.appPackages)
      .innerJoin(schema.apps, eq(schema.apps.id, schema.appPackages.appId))
      .where(
        and(
          inArray(schema.appPackages.containerEligibility, [
            'first_party',
            'curated',
            'compatible',
          ]),
          eq(schema.apps.visibilityScope, 'public'),
          eq(schema.apps.isArchived, false),
        ),
      )
      .orderBy(desc(schema.appPackages.createdAt))
      .limit(12);
  } catch {
    return {
      packages: [] as ContainerPackageSummary[],
      requestedAppSlug,
      focused,
    };
  }

  const packages = await Promise.all(
    rows.map(async (row) => {
      const [manifest, permissions, trust] = await Promise.all([
        readJson<AppPackageManifest>(platform.env.APPS, row.manifestPath),
        readJson<AppPermissions>(platform.env.APPS, row.permissionsPath),
        readJson<TrustReport>(platform.env.APPS, row.trustReportPath),
      ]);

      if (!manifest || !permissions || !trust) return null;

      return {
        id: manifest.id,
        slug: manifest.slug,
        name: manifest.name,
        description: manifest.description,
        appKind: manifest.kind,
        entry: manifest.entry,
        version: row.version,
        packageHash: manifest.packageHash,
        standaloneUrl: manifest.domains.canonical,
        permissions,
        trust: {
          containerEligibility: trust.containerEligibility,
          privacy: trust.privacy,
          security: trust.security,
        },
      } satisfies ContainerPackageSummary;
    }),
  );

  return {
    packages: packages.filter(Boolean) as ContainerPackageSummary[],
    requestedAppSlug,
    focused,
  };
};

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  try {
    const obj = await bucket.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text()) as T;
  } catch {
    return null;
  }
}
