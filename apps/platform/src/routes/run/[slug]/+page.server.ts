import type { PageServerLoad } from './$types';
import { containerSlugForRequest } from '$lib/showcase-slugs';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = ({ platform, params, url, setHeaders }) => {
  setHeaders({
    'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  });
  return loadContainerPageData({
    platform,
    url,
    requestedAppSlug: containerSlugForRequest(params.slug),
    focused: true,
  });
};
