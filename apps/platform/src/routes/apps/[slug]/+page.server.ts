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
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
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
import { readAppMeta, readAppProfile } from '$server/deploy/kv-write';
import { canonicalAppUrl, canonicalShowcaseTarget, isFirstPartyShowcase } from '$lib/showcase-slugs';
import { curatedApps } from '$lib/container/state';
import { recordSlugRename, resolveSlugAlias } from '$server/slug-aliases';
import { publicRemixInfoForSlug } from '$server/remix/eligibility';
import {
  connectionBadgesFromConnections,
  connectionBadgesFromKind,
  connectionsFromGuard,
} from '$lib/marketplace/connection-badges';
import type { AppKind } from '$lib/types/app-kind';
import { desc, eq } from 'drizzle-orm';
import { capabilityBadges as capabilityBadgesTable } from '$server/db/schema/proof-events';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import type { TrustReport } from '@shippie/app-package-contract';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const FIRST_PARTY_SOURCE_DIR_BY_SLUG: Record<string, string> = {
  palate: 'showcase-recipe',
};

export const load: PageServerLoad = async ({ platform, params, cookies, locals, url }) => {
  const canonical = canonicalShowcaseTarget(params.slug);
  if (canonical.slug !== params.slug) {
    const search = url.search;
    throw redirect(302, `/apps/${encodeURIComponent(canonical.slug)}${search}`);
  }

  if (!platform?.env.DB) {
    const bundled = bundledAppDetail(params.slug);
    if (bundled) return bundled;
    throw error(503, 'Database binding unavailable');
  }

  const db = getDrizzleClient(platform.env.DB);
  let app: Awaited<ReturnType<typeof findBySlug>>;
  try {
    app = await findBySlug(db, params.slug);
  } catch (err) {
    const bundled = bundledAppDetail(params.slug);
    if (bundled) return bundled;
    console.error('[app-detail] failed to read app record', err);
    throw error(503, 'Database unavailable');
  }
  if (!app) {
    const bundled = bundledAppDetail(params.slug);
    if (bundled) return bundled;
    // A maker may have renamed this app — 302 old slug → current slug so
    // bookmarks, shared links, and installed PWAs keep working.
    const aliasTarget = await resolveSlugAlias(db, params.slug);
    if (aliasTarget) {
      throw redirect(302, `/apps/${encodeURIComponent(aliasTarget)}${url.search}`);
    }
    throw error(404, 'Not found');
  }

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
    appMeta,
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
      platform.env.CACHE
        ? readAppMeta(platform.env.CACHE, params.slug)
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
          trustReportPath: schema.appPackages.trustReportPath,
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
  const latestTrust =
    platform.env.APPS && packageRows[0]?.trustReportPath
      ? await readJson<TrustReport>(platform.env.APPS, packageRows[0].trustReportPath)
      : null;
  const fallbackExternalDomains =
    permissions?.allowedConnectDomains?.map((domain) => ({
      domain,
      purpose: 'Declared network access',
      personalData: false,
    })) ?? [];
  const detectedKind = asAppKind(app.currentDetectedKind);
  const guardConnections = connectionsFromGuard(appMeta?.connection_guard);
  const guardBadges = connectionBadgesFromConnections(guardConnections);
  const connectionBadges =
    guardBadges.length > 0
      ? guardBadges
      : permissions?.externalNetwork
        ? connectionBadgesFromConnections(
            fallbackExternalDomains.map((domain) => ({
              host: domain.domain,
              purpose: domain.purpose,
              category: 'feature',
            })),
            detectedKind,
          )
        : connectionBadgesFromKind(detectedKind);

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
  const parentApp =
    lineage?.parentAppId
      ? await db.query.apps.findFirst({
          where: eq(schema.apps.id, lineage.parentAppId),
          columns: { id: true, slug: true, name: true },
        })
      : null;
  // Source/license/remix-availability come from the same helper the
  // `/api/apps/[slug]/remix` endpoint uses, so the public page and the
  // CLI/MCP path can't disagree. For first-party showcases the helper
  // returns the monorepo path + AGPL-3.0-or-later; for user apps it
  // returns what the maker declared in their lineage row.
  const remixInfo = await publicRemixInfoForSlug(db, app.slug);
  const sourceRepo = remixInfo.sourceRepo;
  const remixAvailable = remixInfo.remixAvailable;
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
      visibility: (app.visibilityScope ?? 'public') as
        | 'public'
        | 'unlisted'
        | 'private',
      pwaReadiness: {
        status: app.currentPwaReadiness,
        reasons: app.currentPwaReadinessReasons ?? [],
        checkedAt: app.currentPwaReadinessCheckedAt,
      },
    },
    ownership: {
      maker: {
        name: maker?.displayName ?? maker?.name ?? maker?.username ?? 'Unknown maker',
        username: maker?.username ?? null,
        verified: maker?.verifiedMaker ?? false,
      },
      sourceRepo,
      license: remixInfo.license ?? lineage?.license ?? null,
      remixAllowed: lineage?.remixAllowed ?? false,
      remixAvailable,
      remixVia: remixInfo.remixVia,
      lineage: {
        templateId: lineage?.templateId ?? null,
        parentAppId: lineage?.parentAppId ?? null,
        parentVersion: lineage?.parentVersion ?? null,
        parentApp: parentApp
          ? {
              slug: parentApp.slug,
              name: parentApp.name,
            }
          : null,
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
      // Single canonical URL — the unification plan collapsed the
      // dual "Open" + "Open in Shippie" buttons into one. First-party
      // showcases land at /run/<slug>/, the focused-mode shell route
      // that embeds the static run tree. Maker apps still resolve via
      // their own subdomain; once the /run/[slug]/ shell route is in
      // and proxies maker R2 bundles, this branch collapses.
      standaloneUrl: canonicalAppUrl(app.slug),
    },
    signingTrust: isFirstPartyShowcase(app.slug)
      ? {
          label: 'Shippie-signed',
          scope: 'first-party',
          summary: 'Built, packaged, and shipped by Shippie as part of the first-party showcase slate.',
          packageHash: packageRows[0]?.packageHash ?? null,
          version: packageRows[0]?.version ?? null,
        }
      : null,
    trustCard: {
      privacyGrade: latestTrust?.privacy.grade ?? (permissions?.externalNetwork ? 'Review' : 'Local'),
      securityScore: latestTrust?.security.score ?? null,
      externalDomains: latestTrust?.privacy.externalDomains ?? fallbackExternalDomains,
      containerEligibility:
        latestTrust?.containerEligibility ??
        packageRows[0]?.containerEligibility ??
        (isFirstPartyShowcase(app.slug) ? 'first_party' : 'compatible'),
      dataLocation: 'On this device by default',
      serverContent: permissions?.externalNetwork
        ? 'This app declares external network access; review the domains below before using it.'
        : 'No app content stored on Shippie servers by default',
      proofBadges: capabilityBadges.filter((badge) => badge.proven).map((badge) => badge.label),
    },
    connectionBadges,
    grantedPermissions,
    capabilityBadges,
    changelog,
    ratingSummary,
    latestReviews,
    isMaker: locals.user?.id === app.makerId,
  };
};

function bundledAppDetail(slug: string) {
  const app = curatedApps.find((item) => item.slug === slug);
  if (!app || !isFirstPartyShowcase(slug)) return null;
  const category = app.category ?? 'tools';
  return {
    app: {
      slug: app.slug,
      name: app.name,
      tagline: app.description,
      description: app.description,
      type: 'app',
      category,
      iconUrl: null,
      themeColor: app.accent,
      upvoteCount: 0,
      installCount: 0,
      visibility: 'public' as const,
      pwaReadiness: {
        status: 'confirmed' as const,
        reasons: ['first-party-showcase'],
        checkedAt: null,
      },
    },
    ownership: {
      maker: {
        name: 'Shippie',
        username: 'shippie',
        verified: true,
      },
      sourceRepo: `https://github.com/theprovider123/shippie/tree/main/apps/${FIRST_PARTY_SOURCE_DIR_BY_SLUG[app.slug] ?? `showcase-${app.slug}`}`,
      license: 'AGPL-3.0-or-later',
      remixAllowed: true,
      remixAvailable: true,
      remixVia: 'cli' as const,
      lineage: {
        templateId: null,
        parentAppId: null,
        parentVersion: null,
        parentApp: null,
      },
      customDomains: [],
      versions: [],
      standaloneUrl: canonicalAppUrl(app.slug),
    },
    signingTrust: {
      label: 'Shippie-signed',
      scope: 'first-party',
      summary: 'Built, packaged, and shipped by Shippie as part of the first-party showcase slate.',
      packageHash: null,
      version: null,
    },
    trustCard: {
      privacyGrade: app.appKind === 'cloud' ? 'Review' : 'Local',
      securityScore: null,
      externalDomains: [],
      containerEligibility: 'first_party',
      dataLocation:
        app.appKind === 'cloud'
          ? 'May need the maker server'
          : 'On this device by default',
      serverContent:
        app.appKind === 'cloud'
          ? 'This tool may need a network connection for live features.'
          : 'No app content stored on Shippie servers by default',
      proofBadges: [],
    },
    connectionBadges: connectionBadgesFromKind(app.appKind),
    grantedPermissions: [],
    capabilityBadges: [],
    changelog: null,
    ratingSummary: {
      average: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    },
    latestReviews: [],
    isMaker: false,
  };
}

function asAppKind(value: string | null | undefined): AppKind | null {
  return value === 'local' || value === 'connected' || value === 'cloud' ? value : null;
}

export const actions: Actions = {
  saveProfile: async ({ request, locals, params, platform, url }) => {
    if (!platform?.env.DB) return fail(503, { profileError: 'Database binding unavailable.' });
    if (!locals.user) {
      throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
    }

    const db = getDrizzleClient(platform.env.DB);
    const app = await findBySlug(db, params.slug);
    if (!app) throw error(404, 'Not found');
    if (app.makerId !== locals.user.id) throw error(403, 'Forbidden');

    const form = await request.formData();
    const nextSlug = cleanSlug(form.get('slug'));
    const name = clean(form.get('name'), 80);
    const tagline = clean(form.get('tagline'), 160);
    const category = clean(form.get('category'), 48);
    const sourceRepo = cleanUrl(form.get('sourceRepo'));
    const license = clean(form.get('license'), 80);
    const remixAllowed = Boolean(sourceRepo && license && form.get('remixAllowed') === 'on');

    if (!nextSlug || !name || !category) {
      return fail(400, { profileError: 'Slug, name, and category are required.' });
    }

    const slugChanged = nextSlug !== app.slug;
    if (slugChanged) {
      const reservedSlugs = await loadReservedSlugs(platform.env.DB);
      if (reservedSlugs.has(nextSlug)) {
        return fail(400, { profileError: `Slug '${nextSlug}' is reserved.` });
      }
      const existing = await findBySlug(db, nextSlug);
      if (existing && existing.id !== app.id) {
        return fail(409, { profileError: `Slug '${nextSlug}' is already taken.` });
      }
      if (app.activeDeployId && (!platform.env.CACHE || !platform.env.APPS)) {
        return fail(503, { profileError: 'Slug rename needs runtime storage bindings.' });
      }
    }

    const updatedAt = new Date().toISOString();

    if (slugChanged && platform.env.CACHE && platform.env.APPS) {
      await migrateRuntimeSlug({
        kv: platform.env.CACHE,
        r2: platform.env.APPS,
        db,
        appId: app.id,
        from: app.slug,
        to: nextSlug,
        name,
      });
    }

    await db
      .update(schema.apps)
      .set({
        slug: nextSlug,
        name,
        tagline,
        category,
        githubRepo: sourceRepo,
        updatedAt,
      })
      .where(eq(schema.apps.id, app.id));

    await db
      .insert(schema.appLineage)
      .values({
        appId: app.id,
        sourceRepo,
        license,
        remixAllowed,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.appLineage.appId,
        set: {
          sourceRepo,
          license,
          remixAllowed,
          updatedAt,
        },
      });

    if (slugChanged) {
      // Persist the old slug as an alias so existing links 302 instead of 404.
      await recordSlugRename(db, { appId: app.id, fromSlug: app.slug, toSlug: nextSlug });
      throw redirect(303, `/apps/${encodeURIComponent(nextSlug)}`);
    }

    return { profileOk: true };
  },
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

function clean(value: FormDataEntryValue | null, max: number): string | null {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || null;
}

function cleanSlug(value: FormDataEntryValue | null): string | null {
  const slug = clean(value, 63)?.toLowerCase() ?? null;
  return slug && SLUG_RE.test(slug) ? slug : null;
}

function cleanUrl(value: FormDataEntryValue | null): string | null {
  const text = clean(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function migrateRuntimeSlug(input: {
  kv: KVNamespace;
  r2: R2Bucket;
  db: ReturnType<typeof getDrizzleClient>;
  appId: string;
  from: string;
  to: string;
  name: string;
}): Promise<void> {
  await copyR2Prefix(input.r2, `apps/${input.from}/`, `apps/${input.to}/`);
  await copyKvRuntimeKeys(input.kv, input.from, input.to, input.name);

  const domains = await input.db
    .select({
      domain: schema.customDomains.domain,
      isCanonical: schema.customDomains.isCanonical,
      verifiedAt: schema.customDomains.verifiedAt,
    })
    .from(schema.customDomains)
    .where(eq(schema.customDomains.appId, input.appId));

  for (const domain of domains) {
    if (!domain.verifiedAt) continue;
    await input.kv.put(
      `custom-domains:${domain.domain.toLowerCase()}`,
      JSON.stringify({
        slug: input.to,
        is_canonical: domain.isCanonical,
        canonical_domain: domains.find((row) => row.isCanonical)?.domain ?? domain.domain,
      }),
    );
  }
}

async function copyR2Prefix(r2: R2Bucket, fromPrefix: string, toPrefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await r2.list({ prefix: fromPrefix, cursor });
    for (const item of listed.objects) {
      const source = await r2.get(item.key);
      if (!source) continue;
      const destination = toPrefix + item.key.slice(fromPrefix.length);
      await r2.put(destination, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function copyKvRuntimeKeys(
  kv: KVNamespace,
  fromSlug: string,
  toSlug: string,
  name: string,
): Promise<void> {
  const keys = ['active', 'csp', 'wrap', 'profile', 'kind-profile', 'shippie-json', 'building'];
  for (const suffix of keys) {
    const fromKey = `apps:${fromSlug}:${suffix}`;
    const value = await kv.get(fromKey);
    if (!value) continue;
    await kv.put(`apps:${toSlug}:${suffix}`, value);
    await kv.delete(fromKey);
  }

  const metaKey = `apps:${fromSlug}:meta`;
  const meta = await kv.get(metaKey);
  if (meta) {
    try {
      await kv.put(
        `apps:${toSlug}:meta`,
        JSON.stringify({ ...(JSON.parse(meta) as Record<string, unknown>), slug: toSlug, name }),
      );
    } catch {
      await kv.put(`apps:${toSlug}:meta`, meta);
    }
    await kv.delete(metaKey);
  }
}
