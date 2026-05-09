import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = ({ platform, url, locals }) => {
  if (!url.search && url.pathname === '/container') {
    throw redirect(307, '/');
  }
  return loadContainerPageData({ platform, url, userId: locals.user?.id ?? null });
};
