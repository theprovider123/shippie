/**
 * Arcade — `/arcade`. Surface for first-party games AND third-party
 * uploads that declared `curation.surface: "arcade"` in their
 * shippie.json (or chose "Game (Arcade)" in the upload form).
 *
 * Sources:
 *   - `curatedAppsBySurface('arcade')` — first-party showcases, baked
 *     into the platform worker. Always available even when D1 is cold.
 *   - `browsePublic(db, { surface: 'arcade' })` — third-party D1
 *     entries. May be empty.
 *   - `SHELVES` from the generated curation manifest — Shippie Arcade
 *     groupings (Daily Brain / Arcade Cabinet / Room Games / Strategy).
 *
 * Layout: a hero strip of 4 featured games + shelves for the rest.
 * Third-party apps appear in a trailing "From the community" shelf.
 */
import type { PageServerLoad } from './$types';
import { curatedAppsBySurface } from '$lib/container/state';
import { getDrizzleClient } from '$server/db/client';
import { browsePublic } from '$server/db/queries/apps';
import { SHELVES, type ArcadeShelf } from '$lib/_generated/first-party-curation';

export interface ArcadeListing {
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

export interface ArcadeShelfRendered {
  key: string;
  title: string;
  subtitle: string;
  games: ArcadeListing[];
}

/**
 * Slugs surfaced in the hero "Featured" strip at the top of the page.
 * Curated by hand based on share-loop + party-game strategic bets.
 * Order matters — first card renders largest on mobile.
 */
const FEATURED_SLUGS = ['five-letter', 'quartet', 'drawing-telephone', 'stack'];

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
  const bySlug = new Map(firstParty.map((g) => [g.slug, g]));

  // Featured hero: 4 cards, in declared order, skipping any not present.
  const featured: ArcadeListing[] = FEATURED_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((g): g is ArcadeListing => Boolean(g));

  // Group first-party arcade games into the canonical shelves.
  const shelves: ArcadeShelfRendered[] = (SHELVES as readonly ArcadeShelf[]).map((shelf) => ({
    key: shelf.key,
    title: shelf.title,
    subtitle: shelf.subtitle,
    games: shelf.slugs
      .map((slug) => bySlug.get(slug))
      .filter((g): g is ArcadeListing => Boolean(g)),
  })).filter((shelf) => shelf.games.length > 0);

  // Third-party arcade apps from D1. Render as their own trailing shelf.
  let thirdParty: ArcadeListing[] = [];
  if (platform?.env.DB) {
    const db = getDrizzleClient(platform.env.DB);
    try {
      const rows = await browsePublic(db, { surface: 'arcade', limit: 60 });
      const firstPartySlugs = new Set(firstParty.map((a) => a.slug));
      thirdParty = rows
        .filter((r) => !firstPartySlugs.has(r.slug))
        .map((r) => ({
          slug: r.slug,
          name: r.name,
          description: r.description ?? r.tagline ?? null,
          standaloneUrl: `/run/${encodeURIComponent(r.slug)}`,
          source: 'third-party',
          upvoteCount: r.upvoteCount,
        }));
    } catch {
      // Swallow — first-party listings still render.
    }
  }

  // Arcade-uncategorised first-party games (no subcategory set) land
  // in their own "More" shelf so nothing falls off the page.
  const shelvedSlugs = new Set(shelves.flatMap((s) => s.games.map((g) => g.slug)));
  const uncategorised = firstParty.filter((g) => !shelvedSlugs.has(g.slug));
  if (uncategorised.length > 0) {
    shelves.push({
      key: 'more',
      title: 'More',
      subtitle: 'Other first-party games.',
      games: uncategorised,
    });
  }
  if (thirdParty.length > 0) {
    shelves.push({
      key: 'community',
      title: 'From the community',
      subtitle: 'Third-party uploads. Same purity rules.',
      games: thirdParty,
    });
  }

  return { featured, shelves };
};
