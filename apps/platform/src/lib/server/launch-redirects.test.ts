import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  RETIRED_PUBLIC_ROUTES,
  redirectPreservingQuery,
  redirectRetiredRoute,
  type RetiredPublicRoute,
} from './launch-redirects';

function captureRedirect(fn: () => unknown): { status: number; location: string } {
  try {
    fn();
  } catch (err) {
    const redirect = err as { status?: number; location?: string };
    return {
      status: redirect.status ?? 0,
      location: redirect.location ?? '',
    };
  }
  throw new Error('Expected redirect to throw');
}

describe('launch retired-route redirects', () => {
  test('preserves incoming query params behind the new target query', () => {
    const result = captureRedirect(() =>
      redirectPreservingQuery(
        new URL('https://shippie.app/arcade?utm=launch&category=old'),
        '/?category=games',
      ),
    );

    expect(result).toEqual({
      status: 301,
      location: '/?category=games&utm=launch&category=old',
    });
  });

  test.each(Object.entries(RETIRED_PUBLIC_ROUTES) as Array<[RetiredPublicRoute, string]>)(
    '%s redirects permanently to %s',
    (route, target) => {
      const result = captureRedirect(() =>
        redirectRetiredRoute(new URL(`https://shippie.app${route}?from=test`), route),
      );

      expect(result.status).toBe(301);
      expect(result.location).toBe(`${target}${target.includes('?') ? '&' : '?'}from=test`);
    },
  );

  test('public route inventory has a launch IA owner or retired redirect', () => {
    const inventoryUrl = new URL('../../../scripts/mobile-audit/route-inventory.json', import.meta.url);
    const inventory = JSON.parse(readFileSync(inventoryUrl, 'utf8')) as {
      rows: Array<{ urlPath: string; shell: string }>;
    };
    const launchOwnedPublicRoutes = new Set([
      '/',
      '/apps/[slug]',
      '/[atname]',
      '/c/[hash]',
      '/docs',
      '/docs/[slug]',
      '/leaderboards',
      '/run/[slug]',
      '/trust-preview',
      '/whitepaper',
    ]);
    const retired = new Set(Object.keys(RETIRED_PUBLIC_ROUTES));
    const orphaned = inventory.rows
      .filter((row) => row.shell === 'public')
      .map((row) => row.urlPath)
      .filter((route) => !launchOwnedPublicRoutes.has(route) && !retired.has(route));

    expect(orphaned).toEqual([]);
  });
});
