/**
 * Labs — `/labs`. Surface for experimental / maker-facing showcases.
 *
 * Same UNION pattern as `/arcade`: first-party + D1 third-party
 * `surface='labs'` entries. Labs runs the arcade purity scanner in
 * report-only mode (warns the maker dashboard but doesn't block) so
 * makers can iterate before promoting to arcade.
 */
import type { PageServerLoad } from './$types';
import { curatedAppsBySurface } from '$lib/container/state';
import { getDrizzleClient } from '$server/db/client';
import { browsePublic } from '$server/db/queries/apps';

interface LabsListing {
  slug: string;
  name: string;
  shortName?: string;
  description: string | null;
  icon?: string;
  accent?: string;
  standaloneUrl?: string;
  source: 'first-party' | 'third-party';
  upvoteCount?: number;
}

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
  setHeaders({
    'cache-control': 'public, max-age=60, stale-while-revalidate=600',
  });

  const firstParty: LabsListing[] = curatedAppsBySurface('labs').map((app) => ({
    slug: app.slug,
    name: app.name,
    shortName: app.shortName,
    description: app.description,
    icon: app.icon,
    accent: app.accent,
    standaloneUrl: app.standaloneUrl,
    source: 'first-party',
  }));

  let thirdParty: LabsListing[] = [];
  if (platform?.env.DB) {
    const db = getDrizzleClient(platform.env.DB);
    try {
      const rows = await browsePublic(db, { surface: 'labs', limit: 60 });
      const firstPartySlugs = new Set(firstParty.map((a) => a.slug));
      thirdParty = rows
        .filter((r) => !firstPartySlugs.has(r.slug))
        .map((r) => ({
          slug: r.slug,
          name: r.name,
          description: r.description ?? r.tagline ?? null,
          standaloneUrl: `/run/${encodeURIComponent(r.slug)}/`,
          source: 'third-party',
          upvoteCount: r.upvoteCount,
        }));
    } catch {
      /* swallow */
    }
  }

  return { apps: [...firstParty, ...thirdParty] };
};
