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
  // Phase 2 cleanup — Chiwit and Quiet absorb the loose daily wellness
  // mirrors. Move and body metrics route to Lift because training/body
  // logging has a sharper standalone home there.
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
  // first-party showcase so the alias is safe to ship now. The retired
  // apps' bundles continue
  // to be baked — their shippie.json declares
  // `curation.surface: 'archived'` so the marketplace hides them, but
  // old direct URLs hit the alias and resolve to the canonical
  // successor via the explicit 302 in /run/[slug]/+page.server.ts.
  'live-room': 'match-room',
  'show-and-tell': 'whiteboard',
  matchday: 'match-room',
  move: 'lift',
  'habit-tracker': 'chiwit',

  // 2026-06-11 kitchen consolidation — the new palate. kitchen companion
  // absorbs the cooking instruments; mise/cooking/dough are retired.
  // Chiwit's garden tracks water, so sip links land there now.
  'sip-log': 'chiwit',
  mise: 'palate',
  dough: 'palate',

  // Launch slate Phase 4 — food utilities now live as tabs inside
  // Palate so the cooking workflow has one mobile home.
  'shopping-list': 'palate',
  'meal-planner': 'palate',
  'pantry-scanner': 'palate',
  'photo-a-day': 'snap-and-forget',
  'body-metrics': 'lift',
  breath: 'quiet',
  'colour-of-day': 'chiwit',
};

const SLUG_ALIAS_SEARCH_PARAMS: Record<string, Record<string, string>> = {
  'live-room': { from: 'live-room' },
  'show-and-tell': { mode: 'show-and-tell', from: 'show-and-tell' },
  'shopping-list': { tab: 'shop', from: 'shopping-list' },
  'meal-planner': { tab: 'plan', from: 'meal-planner' },
  'pantry-scanner': { tab: 'pantry', from: 'pantry-scanner' },
  cooking: { tab: 'cookbook', from: 'cooking' },
  'photo-a-day': { from: 'photo-a-day' },
  'body-metrics': { from: 'body-metrics' },
  breath: { from: 'breath' },
  'colour-of-day': { tab: 'track', from: 'colour-of-day' },
  'daily-briefing': { tab: 'today', from: 'daily-briefing' },
  'mood-pulse': { tab: 'track', from: 'mood-pulse' },
  pomodoro: { tab: 'track', from: 'pomodoro' },
  'sip-log': { tab: 'track', from: 'sip-log' },
  'habit-tracker': { tab: 'track', from: 'habit-tracker' },
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

export function canonicalAppPath(slug: string, existingSearch = ''): string {
  const canonical = canonicalShowcaseTarget(slug);
  const search = new URLSearchParams(existingSearch);
  for (const [key, value] of Object.entries(canonical.searchParams ?? {})) {
    search.set(key, value);
  }
  const query = search.toString();
  return `/${encodeURIComponent(canonical.slug)}${query ? `?${query}` : ''}`;
}

export function canonicalRunPath(slug: string, existingSearch = ''): string {
  const canonical = canonicalShowcaseTarget(slug);
  const search = new URLSearchParams(existingSearch);
  for (const [key, value] of Object.entries(canonical.searchParams ?? {})) {
    search.set(key, value);
  }
  const query = search.toString();
  return `/run/${encodeURIComponent(canonical.slug)}${query ? `?${query}` : ''}`;
}

export function canonicalAppUrl(slug: string): string {
  return canonicalAppPath(slug);
}

export function appShareImagePath(slug: string): string {
  return `/api/apps/${encodeURIComponent(canonicalShowcaseSlug(slug))}/og.svg`;
}

export function appShareImageUrl(slug: string, origin = 'https://shippie.app'): string {
  return new URL(appShareImagePath(slug), origin).toString();
}
