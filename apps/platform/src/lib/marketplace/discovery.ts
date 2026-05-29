/**
 * Discovery contract for scaling to 100+ apps.
 *
 * The plan's north star: Shippie should feel like a calm OS, not a directory.
 * The ONLY controlled navigation axes are Category, Kind, and Surface. Adding a
 * fourth controlled taxonomy (facets, intent-families, …) is how the drawer
 * degrades into chip sprawl — so this module codifies the contract and a
 * regression test holds the line.
 *
 *   - Category — broad content/workflow door (controlled vocab, bounded).
 *   - Kind     — Local / Connected / Cloud (already exists; do NOT re-derive
 *                it as "offline"/"connected" tags).
 *   - Surface  — featured / arcade / labs / archived (curation/quality axis).
 *   - Tags     — optional, maker-supplied, SEARCH-ONLY. Never a chip rail.
 *   - Collections — editorial views over apps, not stored app identity.
 *   - Search   — the primary scale path past a few dozen apps.
 */
import { VALID_CATEGORIES } from '$lib/curation/schema';

/** The only controlled navigation axes. A 4th here is a design smell. */
export const CONTROLLED_DISCOVERY_AXES = ['category', 'kind', 'surface'] as const;
export type DiscoveryAxis = (typeof CONTROLLED_DISCOVERY_AXES)[number];

/**
 * Browse/exploration filters: the controlled axes plus free-text search and the
 * remixable flag. Tags are deliberately absent — they feed search, not browse.
 */
export const BROWSE_FILTERS = ['category', 'kind', 'surface', 'search', 'remixable'] as const;
export type BrowseFilter = (typeof BROWSE_FILTERS)[number];

/**
 * App-drawer ordering: personal context first; broad exploration is a separate
 * Browse view, not the drawer. Order is significant (recent leads).
 */
export const DRAWER_SECTIONS = ['recent', 'pinned', 'installed', 'suggested'] as const;
export type DrawerSection = (typeof DRAWER_SECTIONS)[number];

/**
 * Upper bound on controlled categories. Past this, categories stop being a
 * scannable set of doors and become chip sprawl — reach for a collection or
 * search refinement instead of minting another category.
 */
export const MAX_CONTROLLED_CATEGORIES = 12;

/** Tags are search-only — assert a string isn't being treated as a browse axis. */
export function isControlledAxis(value: string): value is DiscoveryAxis {
  return (CONTROLLED_DISCOVERY_AXES as readonly string[]).includes(value);
}

/** Guard: the controlled category vocab must stay within the chip-sprawl budget. */
export function categoryCountWithinBudget(): boolean {
  return VALID_CATEGORIES.length <= MAX_CONTROLLED_CATEGORIES;
}
