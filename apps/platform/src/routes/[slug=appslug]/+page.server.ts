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

export const load: PageServerLoad = async ({ platform, params, url, setHeaders, depends, request }) => {
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
