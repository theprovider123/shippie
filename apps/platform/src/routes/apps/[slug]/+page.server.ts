/**
 * App detail — `/apps/[slug]`.
 *
 * Renders the post-honesty-pass detail page:
 *   - Real upvote / install counts (denormalised from D1 columns)
 *   - Real category + type
 *   - Capability badges only when the autopackager observed them
 *   - NO 5/5 fabricated compatibility score
 *   - NO V2 tech badge
 *   - NO permission checkmarks the app didn't declare
 *
 * Private-app gating reads the invite cookie via @shippie/access. Phase 4a
 * supports the cookie-only path; the user-grant lookup against
 * `app_access` lands in Phase 4b alongside the access dashboard.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyInviteGrant, inviteCookieName } from '@shippie/access/invite-cookie';
import { getDrizzleClient, schema } from '$server/db/client';
import {
  findBySlug,
  findPermissionsForApp,
  findLatestDeploy,
} from '$server/db/queries/apps';
import { summaryForApp, recentReviews } from '$server/db/queries/ratings';
import { describeGrantedPermissions } from '$server/marketplace/honesty';
import { publicCapabilityBadgesWithProven } from '$server/marketplace/capability-badges';
import { readAppProfile } from '$server/deploy/kv-write';
import { desc, eq } from 'drizzle-orm';
import { capabilityBadges as capabilityBadgesTable } from '$server/db/schema/proof-events';

export const load: PageServerLoad = async ({ platform, params, cookies, locals, url }) => {
  if (!platform?.env.DB) throw error(503, 'Database binding unavailable');

  const db = getDrizzleClient(platform.env.DB);
  const app = await findBySlug(db, params.slug);
  if (!app) throw error(404, 'Not found');

  // Private-app gate. We treat private as 404-when-denied so app
  // existence isn't leaked.
  if (app.visibilityScope === 'private') {
    const isProd = url.hostname.endsWith('.shippie.app') || url.hostname === 'shippie.app';
    const cookieName = inviteCookieName(params.slug, { secure: isProd });
    const raw = cookies.get(cookieName);
    const secret = platform.env.AUTH_SECRET;
    let allowed = false;
    if (locals.user && app.makerId === locals.user.id) {
      allowed = true;
    } else if (raw && secret) {
      const verified = await verifyInviteGrant(raw, secret);
      if (verified && verified.app === params.slug) allowed = true;
    }
    if (!allowed) throw error(404, 'Not found');
  }

  const [
    permissions,
    latestDeploy,
    ratingSummary,
    latestReviews,
    appProfile,
    provenBadges,
    makerRows,
    domainRows,
    lineageRows,
    packageRows,
  ] =
    await Promise.all([
      findPermissionsForApp(db, app.id),
      findLatestDeploy(db, app.id),
      summaryForApp(db, app.id),
      recentReviews(db, app.id, 5),
      platform.env.CACHE
        ? readAppProfile(platform.env.CACHE, params.slug)
        : Promise.resolve(null),
      db
        .select({ badge: capabilityBadgesTable.badge })
        .from(capabilityBadgesTable)
        .where(eq(capabilityBadgesTable.appId, app.id)),
      db
        .select({
          username: schema.users.username,
          displayName: schema.users.displayName,
          name: schema.users.name,
          verifiedMaker: schema.users.verifiedMaker,
        })
        .from(schema.users)
        .where(eq(schema.users.id, app.makerId))
        .limit(1),
      db
        .select({
          domain: schema.customDomains.domain,
          isCanonical: schema.customDomains.isCanonical,
          verifiedAt: schema.customDomains.verifiedAt,
        })
        .from(schema.customDomains)
        .where(eq(schema.customDomains.appId, app.id)),
      db
        .select({
          sourceRepo: schema.appLineage.sourceRepo,
          license: schema.appLineage.license,
          remixAllowed: schema.appLineage.remixAllowed,
          templateId: schema.appLineage.templateId,
          parentAppId: schema.appLineage.parentAppId,
          parentVersion: schema.appLineage.parentVersion,
        })
        .from(schema.appLineage)
        .where(eq(schema.appLineage.appId, app.id))
        .limit(1),
      db
        .select({
          version: schema.appPackages.version,
          channel: schema.appPackages.channel,
          packageHash: schema.appPackages.packageHash,
          containerEligibility: schema.appPackages.containerEligibility,
          createdAt: schema.appPackages.createdAt,
        })
        .from(schema.appPackages)
        .where(eq(schema.appPackages.appId, app.id))
        .orderBy(desc(schema.appPackages.createdAt))
        .limit(5),
    ]);

  const grantedPermissions = describeGrantedPermissions(permissions);
  const capabilityBadges = publicCapabilityBadgesWithProven(
    provenBadges,
    latestDeploy?.autopackagingReport,
    appProfile,
  );

  // Changelog from the autopackaging report — only show if the app
  // actually wrote one (no 'default' filler).
  const autopack = (latestDeploy?.autopackagingReport ?? null) as {
    changelog?: { source: string; entries: string[]; summary: string };
  } | null;
  const changelog =
    autopack?.changelog && autopack.changelog.source !== 'default'
      ? autopack.changelog
      : null;
  const maker = makerRows[0] ?? null;
  const lineage = lineageRows[0] ?? null;
  const verifiedDomains = domainRows
    .filter((domain) => domain.verifiedAt)
    .map((domain) => ({
      domain: domain.domain,
      isCanonical: domain.isCanonical,
    }));

  return {
    app: {
      slug: app.slug,
      name: app.name,
      tagline: app.tagline,
      description: app.description,
      type: app.type,
      category: app.category,
      iconUrl: app.iconUrl,
      themeColor: app.themeColor,
      upvoteCount: app.upvoteCount,
      installCount: app.installCount,
    },
    ownership: {
      maker: {
        name: maker?.displayName ?? maker?.name ?? maker?.username ?? 'Unknown maker',
        username: maker?.username ?? null,
        verified: maker?.verifiedMaker ?? false,
      },
      sourceRepo: lineage?.sourceRepo ?? app.githubRepo ?? null,
      license: lineage?.license ?? null,
      remixAllowed: lineage?.remixAllowed ?? false,
      lineage: {
        templateId: lineage?.templateId ?? null,
        parentAppId: lineage?.parentAppId ?? null,
        parentVersion: lineage?.parentVersion ?? null,
      },
      customDomains: verifiedDomains,
      versions: packageRows.map((pkg) => ({
        version: pkg.version,
        channel: pkg.channel,
        packageHash: pkg.packageHash,
        containerEligibility: pkg.containerEligibility,
        createdAt: pkg.createdAt,
        packageUrl: `/api/apps/${encodeURIComponent(app.slug)}/packages/${encodeURIComponent(pkg.packageHash)}`,
      })),
      openInShippieUrl: `/container?app=${encodeURIComponent(app.slug)}`,
      standaloneUrl: `https://${app.slug}.shippie.app/`,
    },
    grantedPermissions,
    capabilityBadges,
    changelog,
    ratingSummary,
    latestReviews,
    isMaker: locals.user?.id === app.makerId,
  };
};
