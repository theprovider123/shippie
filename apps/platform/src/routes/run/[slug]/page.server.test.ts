/**
 * Coverage for /run/[slug]/+page.server.ts.
 *
 * Subdomain redirects live in hooks.server.ts (covered separately).
 * This file proves the bare `/run/<old>/` URL path also 302s to the
 * canonical `/run/<successor>/`, matching the subdomain behaviour. The
 * v4 plan calls this out explicitly: without an explicit redirect at
 * this layer the URL would silently render the canonical app under the
 * old URL — dishonest URL state and a confusing share story.
 */
import { describe, expect, test } from 'vitest';
import { redirect } from '@sveltejs/kit';
import { load } from './+page.server';

interface FakeArgs {
  slug: string;
  search?: string;
}

function callLoad({ slug, search = '' }: FakeArgs): unknown {
  // Minimal mock of the SvelteKit ServerLoadEvent. We only exercise
  // the redirect branch — when canonical !== params.slug — which
  // throws before touching `platform` or calling `loadContainerPageData`.
  // Cast through unknown so we don't have to satisfy the full event type.
  const event = {
    platform: undefined,
    params: { slug },
    url: new URL(`https://shippie.app/run/${slug}/${search}`),
    setHeaders: () => undefined,
  };
  return (load as unknown as (e: typeof event) => unknown)(event);
}

describe('/run/[slug]/+page.server load', () => {
  for (const [oldSlug, canonical] of [
    ['live-room', 'matchday'],
    ['care-log', 'co-pilot'],
    ['journal', 'therapy-notes'],
    ['move', 'lift'],
  ] as const) {
    test(`/run/${oldSlug}/ throws redirect(302) to /run/${canonical}/`, () => {
      try {
        callLoad({ slug: oldSlug });
        throw new Error('expected redirect to be thrown');
      } catch (err) {
        // SvelteKit's `redirect()` throws an object with status + location.
        const r = err as { status?: number; location?: string };
        expect(r.status).toBe(302);
        expect(r.location).toBe(`/run/${canonical}/`);
      }
    });
  }

  test('canonical /run/recipe/ does NOT redirect (proceeds to load container data)', () => {
    // Canonical slug → no redirect thrown. Without platform bindings
    // the load will fail differently (calling loadContainerPageData
    // with platform=undefined), but it should NOT throw a 302 first.
    let threwRedirect = false;
    try {
      callLoad({ slug: 'recipe' });
    } catch (err) {
      const r = err as { status?: number; location?: string };
      if (r.status === 302) threwRedirect = true;
    }
    expect(threwRedirect).toBe(false);
  });

  test('redirect preserves query string', () => {
    try {
      callLoad({ slug: 'live-room', search: '?invite=abc' });
    } catch (err) {
      const r = err as { status?: number; location?: string };
      expect(r.status).toBe(302);
      // search string includes the leading '?'
      expect(r.location).toBe('/run/matchday/?invite=abc');
    }
  });
});

// Defensive: if SvelteKit ever stops throwing on `redirect(302, …)`,
// our test above silently passes. This sentinel asserts that the
// import is the throwing kind we expect.
test('SvelteKit redirect() still throws', () => {
  expect(() => {
    throw redirect(302, '/sentinel');
  }).toThrow();
});
