import type { PageServerLoad } from './$types';
import { loadContainerPageData } from '$server/container-page-data';
import { curatedApps } from '$lib/container/state';
import { getDrizzleClient } from '$server/db/client';
import { curationOverrides } from '$server/db/queries/apps';
import type { CurationOverride } from '$lib/launcher';

/**
 * Live D1 curation state as serialisable entries — `load` can't return
 * a Map. The drawer rebuilds the Map client-side and feeds it to
 * `mergeCatalog`, so admin visibility changes reach the dock without a
 * redeploy (same overlay `/tools` applies server-side).
 */
async function curationOverrideEntries(
  platform: App.Platform | undefined,
): Promise<[string, CurationOverride][] | undefined> {
  if (!platform?.env.DB) return undefined;
  try {
    const db = getDrizzleClient(platform.env.DB);
    const overrides = await curationOverrides(db, curatedApps.map((app) => app.slug));
    return [...overrides.entries()];
  } catch {
    // Baked manifest is the fallback truth when D1 is unreachable.
    return undefined;
  }
}

export const load: PageServerLoad = async ({ platform, url, locals, request, setHeaders, depends }) => {
  depends('app:apps');
  // The container is the PWA shell. Never edge/browser-cache the HTML:
  // a stale shell can point at a stale chunk graph and strand the user
  // on the generic SvelteKit error screen after a deploy.
  setHeaders({ 'cache-control': 'no-store' });
  const [pageData, curationOverrideEntriesList] = await Promise.all([
    loadContainerPageData({
      platform,
      url,
      userId: locals.user?.id ?? null,
      userEmail: locals.user?.email ?? null,
      request,
    }),
    curationOverrideEntries(platform),
  ]);
  return {
    ...pageData,
    curationOverrideEntries: curationOverrideEntriesList,
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
