import { redirect } from '@sveltejs/kit';

export const RETIRED_PUBLIC_ROUTES = {
  '/arcade': '/tools?category=games',
  // '/leaderboards' un-retired 2026-05-18 (P0.7) — now wired to aggregate
  // shelves (New / Trending / Top-rated). The /tools?sort=trending fallback
  // stayed in place until the page server hooked into the leaderboard
  // helpers; it's restored as a live route now.
  '/glance': '/dock?section=home',
  '/build': '/docs/build',
  '/why': '/docs/why',
  '/professionals': '/docs/pro',
  '/labs': '/docs/labs',
} as const;

export type RetiredPublicRoute = keyof typeof RETIRED_PUBLIC_ROUTES;

export function redirectPreservingQuery(url: URL, target: string, status = 301): void {
  const destination = new URL(target, url.origin);
  for (const [key, value] of url.searchParams) {
    destination.searchParams.append(key, value);
  }
  throw redirect(status, `${destination.pathname}${destination.search}`);
}

export function redirectRetiredRoute(url: URL, route: RetiredPublicRoute): void {
  redirectPreservingQuery(url, RETIRED_PUBLIC_ROUTES[route]);
}
