import { redirect } from '@sveltejs/kit';

export const RETIRED_PUBLIC_ROUTES = {
  '/arcade': '/?category=games',
  '/leaderboards': '/?sort=trending',
  '/glance': '/container?section=home',
  '/today': '/container?section=home',
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
