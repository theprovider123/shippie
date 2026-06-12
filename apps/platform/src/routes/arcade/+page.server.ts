import type { PageServerLoad } from './$types';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = async ({ platform, url, setHeaders, depends, request }) => {
  setHeaders({
    'cache-control': 'no-store',
  });
  depends('app:apps');
  const containerData = await loadContainerPageData({
    platform,
    url,
    request,
    requestedAppSlug: 'arcade',
    focused: true,
  });
  return {
    ...containerData,
    requestedAppSlug: 'arcade',
    origin: url.origin,
  };
};
