import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { AppPackageManifest, AppPermissions, TrustReport } from '@shippie/app-package-contract';
import {
  inviteCookieName,
  verifyInviteGrant,
} from '@shippie/access/invite-cookie';
import {
  isPrivateJoinRequest,
  privateJoinTransferIdFromUrl,
} from '$server/invites/private-join';
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
  packageUrl: string;
  standaloneUrl: string;
  permissions: AppPermissions;
  trust: Pick<TrustReport, 'containerEligibility' | 'privacy' | 'security'>;
  visibility: 'public' | 'unlisted' | 'private' | 'team';
  owned: boolean;
};

export type ContainerPrivateJoin = {
  kind: 'private-space';
  appSlug: string;
  appId: string;
  appName: string;
  packageHash: string;
  packageUrl: string;
  transferId: string | null;
  source: 'invite' | 'grant';
};

type ContainerPageDataInput = {
  platform: App.Platform | undefined;
  url: URL;
  requestedAppSlug?: string | null;
  focused?: boolean;
  userId?: string | null;
  userEmail?: string | null;
  request?: Request | null;
};

export async function loadContainerPageData({
  platform,
  url,
  requestedAppSlug = url.searchParams.get('app'),
  focused = url.searchParams.get('focused') === '1',
  userId = null,
  userEmail = null,
  request = null,
}: ContainerPageDataInput) {
  if (!platform?.env.DB || !platform.env.APPS) {
    return {
      packages: [] as ContainerPackageSummary[],
      requestedAppSlug,
      focused,
      privateJoin: null as ContainerPrivateJoin | null,
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const accessPredicates = [
    userId ? eq(schema.appAccess.userId, userId) : null,
    userEmail ? eq(schema.appAccess.email, userEmail) : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);
  const accessRows = accessPredicates.length > 0
    ? await db
        .select({ appId: schema.appAccess.appId })
        .from(schema.appAccess)
        .where(and(or(...accessPredicates), isNull(schema.appAccess.revokedAt)))
    : [];
  const inviteGrantsRequestedApp = requestedAppSlug && request
    ? await hasInviteGrantForSlug(request, platform.env, requestedAppSlug)
    : false;
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
    accessRows.length > 0 ? inArray(schema.apps.id, accessRows.map((row) => row.appId)) : null,
    inviteGrantsRequestedApp && requestedAppSlug ? eq(schema.apps.slug, requestedAppSlug) : null,
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
      .limit(requestedAppSlug ? 50 : 12);
  } catch {
    return {
      packages: [] as ContainerPackageSummary[],
      requestedAppSlug,
      focused,
      privateJoin: null as ContainerPrivateJoin | null,
    };
  }

  const packageResults = await Promise.all(
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
        packageUrl: packageDownloadUrl(manifest.slug, manifest.packageHash),
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
  const packages = packageResults.filter(Boolean) as ContainerPackageSummary[];

  return {
    packages,
    requestedAppSlug,
    focused,
    privateJoin: resolvePrivateJoinState({
      url,
      requestedAppSlug,
      packages,
      inviteGrantForRequestedApp: inviteGrantsRequestedApp,
    }),
  };
}

export function packageDownloadUrl(slug: string, packageHash: string): string {
  return `/api/apps/${encodeURIComponent(slug)}/packages/${encodeURIComponent(packageHash)}`;
}

export function resolvePrivateJoinState(input: {
  url: URL;
  requestedAppSlug: string | null | undefined;
  packages: readonly ContainerPackageSummary[];
  inviteGrantForRequestedApp: boolean;
}): ContainerPrivateJoin | null {
  if (!isPrivateJoinRequest(input.url) || !input.requestedAppSlug) return null;
  const pkg = input.packages.find((candidate) => candidate.slug === input.requestedAppSlug);
  if (!pkg) return null;
  return {
    kind: 'private-space',
    appSlug: pkg.slug,
    appId: pkg.id,
    appName: pkg.name,
    packageHash: pkg.packageHash,
    packageUrl: pkg.packageUrl,
    transferId: privateJoinTransferIdFromUrl(input.url),
    source: input.inviteGrantForRequestedApp ? 'invite' : 'grant',
  };
}

function normalizeVisibility(value: string): ContainerPackageSummary['visibility'] {
  return value === 'private' || value === 'unlisted' || value === 'team' ? value : 'public';
}

async function hasInviteGrantForSlug(
  request: Request,
  env: { INVITE_SECRET?: string; AUTH_SECRET?: string },
  slug: string,
): Promise<boolean> {
  const secret = env.INVITE_SECRET ?? env.AUTH_SECRET;
  if (!secret) return false;
  const secure = new URL(request.url).protocol === 'https:';
  const cookie = readCookie(request.headers.get('cookie') ?? '', inviteCookieName(slug, { secure }));
  if (!cookie) return false;
  const grant = await verifyInviteGrant(cookie, secret);
  return grant?.app === slug;
}

function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
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
