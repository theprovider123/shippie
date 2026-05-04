/**
 * First-party showcase slugs. Lifted out of `hooks.server.ts` so the
 * marketplace server load + hooks redirect can share one source of
 * truth.
 *
 * Keep this in sync with the slugs the prepare script produces (see
 * `apps/showcase-*\/shippie.json:slug`, falling back to dir name).
 *
 * The unification plan's "Open" button uses this list to decide
 * whether an app's canonical URL is `/run/<slug>/` (first-party,
 * served from the static run/ tree) or `https://<slug>.shippie.app/`
 * (maker app, served via the wrapper-router pipeline). Once the
 * `/run/[slug]/` shell route lands and handles both cases, the
 * branch can collapse to always-`/run/<slug>/`.
 */
export const FIRST_PARTY_SHOWCASE_SLUGS = new Set<string>([
  'recipe',
  'journal',
  'whiteboard',
  'live-room',
  'habit-tracker',
  'workout-logger',
  'pantry-scanner',
  'meal-planner',
  'shopping-list',
  'sleep-logger',
  'body-metrics',
  'sip-log',
  'mood-pulse',
  'coffee',
  'cooking',
  'dough',
  'pace',
  'breath',
  'pomodoro',
  'read-later',
  'daily-briefing',
  'restaurant-memory',
  'show-and-tell',
  'mevrouw',
]);

export function isFirstPartyShowcase(slug: string): boolean {
  return FIRST_PARTY_SHOWCASE_SLUGS.has(slug);
}

export function canonicalAppUrl(slug: string): string {
  return isFirstPartyShowcase(slug)
    ? `/run/${encodeURIComponent(slug)}/`
    : `https://${slug}.shippie.app/`;
}
