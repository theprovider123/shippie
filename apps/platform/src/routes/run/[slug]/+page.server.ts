import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canonicalShowcaseTarget, containerSlugForRequest } from '$lib/showcase-slugs';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = ({ platform, params, url, setHeaders }) => {
  // If the URL slug differs from its canonical (i.e. user hit an old
  // alias like /run/live-room), 302 to /run/<canonical> so the URL
  // bar tells the truth and shareable URLs canonicalise. Matches the
  // subdomain behaviour in hooks.server.ts where <slug>.shippie.app
  // 302s to shippie.app/run/<canonical>. Without this, old slugs
  // would silently render the canonical app under the old URL —
  // dishonest URL state and a confusing share story.
  const canonical = canonicalShowcaseTarget(params.slug);
  if (canonical.slug !== params.slug) {
    const search = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(canonical.searchParams ?? {})) {
      search.set(key, value);
    }
    const query = search.toString();
    const target = `/run/${encodeURIComponent(canonical.slug)}${query ? `?${query}` : ''}`;
    throw redirect(302, target);
  }

  setHeaders({
    'cache-control': 'no-store',
  });
  return loadContainerPageData({
    platform,
    url,
    requestedAppSlug: containerSlugForRequest(canonical.slug),
    focused: true,
  });
};
