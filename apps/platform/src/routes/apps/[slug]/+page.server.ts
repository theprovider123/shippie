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
import { getDrizzleClient } from '$server/db/client';
import {
  findBySlug,
  findPermissionsForApp,
  findLatestDeploy,
} from '$server/db/queries/apps';
import { summaryForApp, recentReviews } from '$server/db/queries/ratings';
import { describeGrantedPermissions } from '$server/marketplace/honesty';
import { publicCapabilityBadgesFromProfile } from '$server/marketplace/capability-badges';
import { readAppProfile } from '$server/deploy/kv-write';

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

  const [permissions, latestDeploy, ratingSummary, latestReviews, appProfile] =
    await Promise.all([
      findPermissionsForApp(db, app.id),
      findLatestDeploy(db, app.id),
      summaryForApp(db, app.id),
      recentReviews(db, app.id, 5),
      platform.env.CACHE
        ? readAppProfile(platform.env.CACHE, params.slug)
        : Promise.resolve(null),
    ]);

  const grantedPermissions = describeGrantedPermissions(permissions);
  const capabilityBadges = publicCapabilityBadgesFromProfile(
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
    grantedPermissions,
    capabilityBadges,
    changelog,
    ratingSummary,
    latestReviews,
    isMaker: locals.user?.id === app.makerId,
  };
};
