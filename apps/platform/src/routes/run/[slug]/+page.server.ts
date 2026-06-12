import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  canonicalRunPath,
  canonicalShowcaseTarget,
  containerSlugForRequest,
  isFirstPartyShowcase,
} from '$lib/showcase-slugs';
import { getDrizzleClient } from '$server/db/client';
import { resolveSlugAlias } from '$server/slug-aliases';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = async ({ platform, params, url, setHeaders, depends }) => {
  // If the URL slug differs from its canonical (i.e. user hit an old
  // alias like /run/live-room), 302 to /run/<canonical> so the URL
  // bar tells the truth and shareable URLs canonicalise. Matches the
  // subdomain behaviour in hooks.server.ts where <slug>.shippie.app
  // 302s to shippie.app/run/<canonical>. Without this, old slugs
  // would silently render the canonical app under the old URL —
  // dishonest URL state and a confusing share story.
  const canonical = canonicalShowcaseTarget(params.slug);
  if (canonical.slug !== params.slug) {
    throw redirect(302, canonicalRunPath(params.slug, url.search));
  }

  // Third-party rename fallback. First-party aliases are handled above by
  // canonicalShowcaseTarget (zero-DB); for maker apps, a retired slug 302s to
  // the current slug. Scoped to non-first-party so the showcase hot path is
  // untouched — one indexed PK lookup only for maker-app runtime URLs.
  if (platform?.env.DB && !isFirstPartyShowcase(canonical.slug)) {
    const aliasTarget = await resolveSlugAlias(getDrizzleClient(platform.env.DB), canonical.slug);
    if (aliasTarget && aliasTarget !== canonical.slug) {
      throw redirect(302, `/run/${encodeURIComponent(aliasTarget)}${url.search}`);
    }
  }

  setHeaders({
    'cache-control': 'no-store',
  });
  depends('app:apps');
  const containerData = await loadContainerPageData({
    platform,
    url,
    requestedAppSlug: containerSlugForRequest(canonical.slug),
    focused: true,
  });
  return {
    ...containerData,
    origin: url.origin,
  };
};
