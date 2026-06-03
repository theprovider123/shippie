import type { PageServerLoad } from './$types';
import { loadContainerPageData } from '$server/container-page-data';

export const load: PageServerLoad = async ({ platform, url, locals, request, setHeaders, depends }) => {
  depends('app:apps');
  // The container is the PWA shell. Never edge/browser-cache the HTML:
  // a stale shell can point at a stale chunk graph and strand the user
  // on the generic SvelteKit error screen after a deploy.
  setHeaders({ 'cache-control': 'no-store' });
  const pageData = await loadContainerPageData({
    platform,
    url,
    userId: locals.user?.id ?? null,
    userEmail: locals.user?.email ?? null,
    request,
  });
  return {
    ...pageData,
    user: locals.user
      ? {
          email: locals.user.email,
          username: locals.user.username,
          displayName: locals.user.displayName,
          isAdmin: locals.user.isAdmin,
        }
      : null,
  };
};
