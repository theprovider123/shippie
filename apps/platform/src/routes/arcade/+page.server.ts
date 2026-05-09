/**
 * Arcade — `/arcade`. Surface for first-party games.
 *
 * Backed by the curation manifest (`shippie.json#curation.surface ===
 * 'arcade'`). Phase 0 ships the route empty; Phase 1+3 fills it with the
 * five Arcade games (Daily Puzzle, Reaction, Memory Grid, Sudoku,
 * Drawing Telephone). Quality gates documented in the slate v4 plan.
 */
import type { PageServerLoad } from './$types';
import { curatedAppsBySurface } from '$lib/container/state';

export const load: PageServerLoad = ({ setHeaders }) => {
  setHeaders({
    'cache-control': 'public, max-age=60, stale-while-revalidate=600',
  });
  const apps = curatedAppsBySurface('arcade').map((app) => ({
    slug: app.slug,
    name: app.name,
    shortName: app.shortName,
    description: app.description,
    icon: app.icon,
    accent: app.accent,
    standaloneUrl: app.standaloneUrl,
  }));
  return { apps };
};
