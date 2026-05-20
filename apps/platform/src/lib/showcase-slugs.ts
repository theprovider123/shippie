/**
 * First-party showcase slugs. Sourced from the generated curation manifest
 * so hooks and marketplace URLs keep working in clean CI checkouts where
 * static showcase runtimes have not been baked yet.
 *
 * The unification plan's "Open" button uses this list to decide
 * whether an app's canonical URL can use the `/run/<slug>/` focused
 * shell route. Runtime iframes still load the underlying static bundle from
 * `/__shippie-run/<slug>/` with `?shippie_embed=1` when that bundle exists.
 */
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';

export interface CanonicalShowcaseTarget {
  slug: string;
  searchParams?: Record<string, string>;
}

const SLUG_ALIASES: Record<string, string> = {
  recipe: 'palate',
  'recipe-saver': 'palate',
  // Phase 2 cleanup — Chiwit absorbs the loose daily wellness mirrors.
  // Move remains routed to Lift because strength/workout logging has a
  // sharper standalone home there.
  pace: 'lift',
  'sleep-logger': 'lift',
  'workout-logger': 'lift',
  pomodoro: 'chiwit',
  'mood-pulse': 'chiwit',
  // daily-briefing demoted to platform-side `/today` surface; until
  // that's fully discoverable, alias into Chiwit's daily pulse.
  'daily-briefing': 'chiwit',
  // Palate absorbed the standalone temperature helper for launch.
  cooking: 'palate',

  // Slate v4 Phase 0 consolidations. Each successor app is a current
  // first-party showcase (match-room, co-pilot, therapy-notes, lift) so
  // the alias is safe to ship now. The retired apps' bundles continue
  // to be baked — their shippie.json declares
  // `curation.surface: 'archived'` so the marketplace hides them, but
  // old direct URLs hit the alias and resolve to the canonical
  // successor via the explicit 302 in /run/[slug]/+page.server.ts.
  'live-room': 'match-room',
  'show-and-tell': 'whiteboard',
  'would-you-rather': 'drawing-telephone',
  matchday: 'match-room',
  'care-log': 'co-pilot',
  journal: 'therapy-notes',
  move: 'lift',

  // Chiwit now owns hydration and caffeine context, so old one-tap
  // sip links open the wellness tracker instead of a narrow mirror.
  'sip-log': 'chiwit',
  // Launch slate Phase 2 — standalone brain games now open as modes
  // inside Daily Puzzle. The target search params below preserve which
  // retired app the person intended to launch.
  sudoku: 'daily-puzzle',
  'memory-grid': 'daily-puzzle',
  reaction: 'daily-puzzle',

  // Launch slate Phase 4 — food utilities now live as tabs inside
  // Palate so the cooking workflow has one mobile home.
  'shopping-list': 'palate',
  'meal-planner': 'palate',
  'pantry-scanner': 'palate',
  'photo-a-day': 'snap-and-forget',
  'body-metrics': 'chiwit',
  breath: 'chiwit',
  'habit-tracker': 'chiwit',
  quiet: 'chiwit',
  'colour-of-day': 'chiwit',
};

const SLUG_ALIAS_SEARCH_PARAMS: Record<string, Record<string, string>> = {
  'live-room': { from: 'live-room' },
  'show-and-tell': { mode: 'show-and-tell', from: 'show-and-tell' },
  'would-you-rather': { pack: 'would-you-rather', from: 'would-you-rather' },
  sudoku: { mode: 'sudoku', from: 'sudoku' },
  'memory-grid': { mode: 'memory-grid', from: 'memory-grid' },
  reaction: { mode: 'reaction', from: 'reaction' },
  'shopping-list': { tab: 'shop', from: 'shopping-list' },
  'meal-planner': { tab: 'plan', from: 'meal-planner' },
  'pantry-scanner': { tab: 'pantry', from: 'pantry-scanner' },
  cooking: { tab: 'cookbook', from: 'cooking' },
  'photo-a-day': { from: 'photo-a-day' },
  'body-metrics': { tab: 'track', from: 'body-metrics' },
  breath: { tab: 'track', from: 'breath' },
  'habit-tracker': { tab: 'track', from: 'habit-tracker' },
  quiet: { tab: 'track', from: 'quiet' },
  'colour-of-day': { tab: 'track', from: 'colour-of-day' },
  'daily-briefing': { tab: 'today', from: 'daily-briefing' },
  'mood-pulse': { tab: 'track', from: 'mood-pulse' },
  pomodoro: { tab: 'track', from: 'pomodoro' },
  'sip-log': { tab: 'track', from: 'sip-log' },
};

export const FIRST_PARTY_SHOWCASE_SLUGS = new Set<string>(
  FIRST_PARTY_CURATION.map((entry) => entry.slug),
);

export function isFirstPartyShowcase(slug: string): boolean {
  return FIRST_PARTY_SHOWCASE_SLUGS.has(canonicalShowcaseTarget(slug).slug);
}

export function canonicalShowcaseSlug(slug: string): string {
  return canonicalShowcaseTarget(slug).slug;
}

export function canonicalShowcaseTarget(slug: string): CanonicalShowcaseTarget {
  return {
    slug: SLUG_ALIASES[slug] ?? slug,
    searchParams: SLUG_ALIAS_SEARCH_PARAMS[slug],
  };
}

export function containerSlugForRequest(slug: string): string {
  return canonicalShowcaseSlug(slug);
}

export function canonicalAppUrl(slug: string): string {
  const canonical = canonicalShowcaseTarget(slug);
  const search = canonical.searchParams ? `?${new URLSearchParams(canonical.searchParams)}` : '';
  return isFirstPartyShowcase(canonical.slug)
    ? `/run/${encodeURIComponent(canonical.slug)}${search}`
    : `https://${slug}.shippie.app/`;
}
