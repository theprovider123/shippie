import { ARCADE_GAME_SLUGS } from '$lib/showcase-slugs';

const ALIASED = new Set<string>(ARCADE_GAME_SLUGS);

/** Slugs that alias INTO the cabinet (so their /run redirect is conditional). */
export function isAliasedArcadeSlug(slug: string): boolean {
  return ALIASED.has(slug);
}
