/**
 * Arcade — `/arcade`. Surface for first-party games AND third-party
 * uploads that declared `curation.surface: "arcade"` in their
 * shippie.json (or chose "Game (Arcade)" in the upload form).
 *
 * Two sources, one merged list:
 *   - `curatedAppsBySurface('arcade')` — first-party showcases, baked
 *     into the platform worker. Always available even when D1 is cold.
 *   - `browsePublic(db, { surface: 'arcade' })` — third-party D1
 *     entries. May be empty.
 *
 * Sort: first-party recent-first (slate-curated), then third-party by
 * upvote count. Same merge pattern as `/apps` uses for
 * `mergeWithBundledApps` so behaviour is consistent.
 */
import type { PageServerLoad } from './$types';
import { curatedAppsBySurface } from '$lib/container/state';
import { getDrizzleClient } from '$server/db/client';
import { browsePublic } from '$server/db/queries/apps';

interface ArcadeListing {
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

  const firstParty: ArcadeListing[] = curatedAppsBySurface('arcade').map((app) => ({
    slug: app.slug,
    name: app.name,
    shortName: app.shortName,
    description: app.description,
    icon: app.icon,
    accent: app.accent,
    standaloneUrl: app.standaloneUrl,
    source: 'first-party',
  }));

  // Third-party arcade apps from D1. Best-effort: a missing DB
  // binding (e.g. local-only without D1) just shows the first-party
  // list — same fallback shape as `/apps`.
  let thirdParty: ArcadeListing[] = [];
  if (platform?.env.DB) {
    const db = getDrizzleClient(platform.env.DB);
    try {
      const rows = await browsePublic(db, { surface: 'arcade', limit: 60 });
      // Dedupe against first-party slugs — a maker can't claim a
      // first-party slug, but the safety belt costs nothing.
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
      // Swallow — first-party listings still render.
    }
  }

  return { apps: [...firstParty, ...thirdParty] };
};
