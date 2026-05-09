import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { AppPackageManifest, AppPermissions, TrustReport } from '@shippie/app-package-contract';
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
  visibility: 'public' | 'unlisted' | 'private' | 'team';
  owned: boolean;
};

type ContainerPageDataInput = {
  platform: App.Platform | undefined;
  url: URL;
  requestedAppSlug?: string | null;
  focused?: boolean;
  userId?: string | null;
};

export async function loadContainerPageData({
  platform,
  url,
  requestedAppSlug = url.searchParams.get('app'),
  focused = url.searchParams.get('focused') === '1',
  userId = null,
}: ContainerPageDataInput) {
  if (!platform?.env.DB || !platform.env.APPS) {
    return {
      packages: [] as ContainerPackageSummary[],
      requestedAppSlug,
      focused,
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const orgIds = userId
    ? await db
        .select({ orgId: schema.organizationMembers.orgId })
        .from(schema.organizationMembers)
        .where(eq(schema.organizationMembers.userId, userId))
    : [];
  const visibilityFilters = [
    eq(schema.apps.visibilityScope, 'public'),
    userId ? eq(schema.apps.makerId, userId) : null,
    orgIds.length > 0
      ? and(
          eq(schema.apps.visibilityScope, 'team'),
          inArray(schema.apps.organizationId, orgIds.map((org) => org.orgId)),
        )
      : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);

  let rows: Array<{
    packageHash: string;
    version: string;
    manifestPath: string;
    permissionsPath: string;
    trustReportPath: string;
    createdAt: string;
    visibilityScope: string;
    makerId: string;
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
        visibilityScope: schema.apps.visibilityScope,
        makerId: schema.apps.makerId,
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
          or(...visibilityFilters),
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
        visibility: normalizeVisibility(row.visibilityScope),
        owned: Boolean(userId && row.makerId === userId),
      } satisfies ContainerPackageSummary;
    }),
  );

  return {
    packages: packages.filter(Boolean) as ContainerPackageSummary[],
    requestedAppSlug,
    focused,
  };
}

function normalizeVisibility(value: string): ContainerPackageSummary['visibility'] {
  return value === 'private' || value === 'unlisted' || value === 'team' ? value : 'public';
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  try {
    const obj = await bucket.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text()) as T;
  } catch {
    return null;
  }
}
