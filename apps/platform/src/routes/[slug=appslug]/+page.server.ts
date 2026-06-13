import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  canonicalAppPath,
  canonicalShowcaseTarget,
  containerSlugForRequest,
  isFirstPartyShowcase,
} from '$lib/showcase-slugs';
import { loadContainerPageData } from '$server/container-page-data';
import { getDrizzleClient } from '$server/db/client';
import { findBySlug } from '$server/db/queries/apps';
import { resolveSlugAlias } from '$server/slug-aliases';
import { isEnabledInArcade } from '$server/arcade/roster';
import { isAliasedArcadeSlug } from '../run/[slug]/arcade-route';

export const load: PageServerLoad = async ({ platform, params, url, setHeaders, depends, request }) => {
  // A pulled arcade game (aliased, but not currently enabled in the cabinet)
  // renders standalone at its own short path instead of redirecting into
  // /arcade. Enabled games fall through to the normal alias redirect.
  if (platform?.env.DB && isAliasedArcadeSlug(params.slug)) {
    const db = getDrizzleClient(platform.env.DB);
    const enabled = await isEnabledInArcade(db, params.slug);
    if (!enabled) {
      setHeaders({ 'cache-control': 'no-store' });
      depends('app:apps');
      const containerData = await loadContainerPageData({
        platform,
        url,
        request,
        requestedAppSlug: params.slug, // its OWN slug, NOT containerSlugForRequest (which would re-alias to 'arcade')
        focused: true,
      });
      return { ...containerData, origin: url.origin };
    }
  }

  const canonical = canonicalShowcaseTarget(params.slug);
  if (canonical.slug !== params.slug) {
    throw redirect(302, canonicalAppPath(params.slug, url.search));
  }

  const firstParty = isFirstPartyShowcase(canonical.slug);
  if (!firstParty) {
    if (!platform?.env.DB) throw error(404, 'App not found');
    const db = getDrizzleClient(platform.env.DB);
    const aliasTarget = await resolveSlugAlias(db, canonical.slug);
    if (aliasTarget && aliasTarget !== canonical.slug) {
      throw redirect(302, `/${encodeURIComponent(aliasTarget)}${url.search}`);
    }
    const app = await findBySlug(db, canonical.slug);
    if (!app || app.isArchived) throw error(404, 'App not found');
  }

  setHeaders({
    'cache-control': 'no-store',
  });
  depends('app:apps');
  const containerData = await loadContainerPageData({
    platform,
    url,
    request,
    requestedAppSlug: containerSlugForRequest(canonical.slug),
    focused: true,
  });
  return {
    ...containerData,
    origin: url.origin,
  };
};
