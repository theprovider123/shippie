import { describe, expect, test } from 'vitest';
import { load } from './+page.server';

interface FakeArgs {
  slug: string;
  search?: string;
}

function callLoad({ slug, search = '' }: FakeArgs): unknown {
  const event = {
    platform: undefined,
    params: { slug },
    url: new URL(`https://shippie.app/${slug}${search}`),
    request: new Request(`https://shippie.app/${slug}${search}`),
    setHeaders: () => undefined,
    depends: () => undefined,
  };
  return (load as unknown as (e: typeof event) => unknown)(event);
}

describe('/[slug=appslug]/+page.server load', () => {
  test('old first-party aliases redirect to the canonical short app URL', async () => {
    try {
      await callLoad({ slug: 'recipe' });
      throw new Error('expected redirect to be thrown');
    } catch (err) {
      const r = err as { status?: number; location?: string };
      expect(r.status).toBe(302);
      expect(r.location).toBe('/palate');
    }
  });

  test('short app URL redirects preserve query params and inject alias params', async () => {
    try {
      await callLoad({ slug: 'shopping-list', search: '?invite=abc' });
      throw new Error('expected redirect to be thrown');
    } catch (err) {
      const r = err as { status?: number; location?: string };
      expect(r.status).toBe(302);
      expect(r.location).toBe('/palate?invite=abc&tab=shop&from=shopping-list');
    }
  });

  test('canonical first-party short URL renders without redirect', async () => {
    let threwRedirect = false;
    try {
      await callLoad({ slug: 'palate' });
    } catch (err) {
      const r = err as { status?: number };
      if (r.status === 302) threwRedirect = true;
    }
    expect(threwRedirect).toBe(false);
  });

  test('unknown short URL 404s when DB bindings are unavailable', async () => {
    try {
      await callLoad({ slug: 'not-a-real-app' });
      throw new Error('expected 404 to be thrown');
    } catch (err) {
      const r = err as { status?: number };
      expect(r.status).toBe(404);
    }
  });
});
