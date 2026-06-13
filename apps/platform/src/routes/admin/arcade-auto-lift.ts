import { bakedArcadeGameSlugs } from '$server/arcade/roster';

/**
 * When an admin publishes an app to 'public', we auto-lift a stuck
 * 'archived' surface so the app actually appears in marketplace listings.
 * However, baked arcade games use 'archived' as the deliberate
 * "pulled from cabinet" state — publishing visibility must not silently
 * re-add them to the arcade.
 *
 * Lives outside `+page.server.ts` because SvelteKit only permits a fixed
 * set of exports from route modules (load/actions/etc.); a colocated
 * helper keeps it importable by both the action and its unit test.
 */
export function shouldAutoLiftArchived(
  slug: string,
  beforeSurface: string,
  newVisibility: string,
): boolean {
  if (newVisibility !== 'public' || beforeSurface !== 'archived') return false;
  // Baked arcade games use archived as the deliberate "pulled from cabinet"
  // state; publishing visibility must not silently re-add them.
  if (bakedArcadeGameSlugs().has(slug)) return false;
  return true;
}
