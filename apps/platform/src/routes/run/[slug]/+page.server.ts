import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  canonicalAppPath,
  canonicalShowcaseTarget,
  isFirstPartyShowcase,
} from '$lib/showcase-slugs';
import { getDrizzleClient } from '$server/db/client';
import { resolveSlugAlias } from '$server/slug-aliases';
import { loadContainerPageData } from '$server/container-page-data';
import { isEnabledInArcade } from '$server/arcade/roster';
import { isAliasedArcadeSlug } from './arcade-route';

export const load: PageServerLoad = async ({ platform, params, url, setHeaders, depends }) => {
  // Conditional arcade alias: an aliased arcade game redirects INTO the
  // cabinet only while it's enabled. Once pulled, serve it standalone
  // (do not apply the snake→arcade alias redirect below).
  if (platform?.env.DB && isAliasedArcadeSlug(params.slug)) {
    const db = getDrizzleClient(platform.env.DB);
    const enabled = await isEnabledInArcade(db, params.slug);
    if (!enabled) {
      setHeaders({ 'cache-control': 'no-store' });
      depends('app:apps');
      const containerData = await loadContainerPageData({
        platform,
        url,
        requestedAppSlug: params.slug, // its OWN slug, NOT containerSlugForRequest (which would re-alias to 'arcade')
        focused: true,
      });
      return { ...containerData, origin: url.origin };
    }
    // enabled → fall through to the normal canonical redirect into the cabinet
  }

  // If the URL slug differs from its canonical (i.e. user hit an old
  // alias like /run/live-room), 302 to /<canonical> so every public
  // browser entry point converges on the short human URL.
  const canonical = canonicalShowcaseTarget(params.slug);
  if (canonical.slug !== params.slug) {
    throw redirect(302, canonicalAppPath(params.slug, url.search));
  }

  // Third-party rename fallback. First-party aliases are handled above by
  // canonicalShowcaseTarget (zero-DB); for maker apps, a retired slug 302s to
  // the current slug. Scoped to non-first-party so the showcase hot path is
  // untouched — one indexed PK lookup only for legacy maker-app URLs.
  if (platform?.env.DB && !isFirstPartyShowcase(canonical.slug)) {
    const aliasTarget = await resolveSlugAlias(getDrizzleClient(platform.env.DB), canonical.slug);
    if (aliasTarget && aliasTarget !== canonical.slug) {
      throw redirect(302, `/${encodeURIComponent(aliasTarget)}${url.search}`);
    }
  }

  throw redirect(302, canonicalAppPath(canonical.slug, url.search));
};
