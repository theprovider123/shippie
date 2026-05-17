import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = ({ platform, url, locals, request, setHeaders }) => {
  if (!url.search && url.pathname === '/container') {
    throw redirect(307, '/');
  }
  // The container is the PWA shell. Never edge/browser-cache the HTML:
  // a stale shell can point at a stale chunk graph and strand the user
  // on the generic SvelteKit error screen after a deploy.
  setHeaders({ 'cache-control': 'no-store' });
  return loadContainerPageData({
    platform,
    url,
    userId: locals.user?.id ?? null,
    userEmail: locals.user?.email ?? null,
    request,
  });
};
