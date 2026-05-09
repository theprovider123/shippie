/**
 * Labs — `/labs`. Surface for experimental / maker-facing showcases.
 *
 * Apps land here when they're useful but not launch-quality, or when
 * they're maker-tooling rather than consumer-facing. Backed by the
 * curation manifest (`shippie.json#curation.surface === 'labs'`).
 */
import type { PageServerLoad } from './$types';
import { curatedAppsBySurface } from '$lib/container/state';

export const load: PageServerLoad = ({ setHeaders }) => {
  setHeaders({
    'cache-control': 'public, max-age=60, stale-while-revalidate=600',
  });
  const apps = curatedAppsBySurface('labs').map((app) => ({
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
