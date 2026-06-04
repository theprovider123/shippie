/**
 * /dashboard is a permanent (308) alias for the maker backend at /maker.
 * These tests lock the redirect contract so old links, emails, and bookmarks
 * keep resolving after the route ownership flip.
 */
import { describe, expect, test } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load as loadIndex } from './+page.server';
import { load as loadCatchAll } from './[...path]/+page.server';

function captureRedirect(fn: () => unknown): { status: number; location: string } {
  try {
    fn();
  } catch (err) {
    if (isRedirect(err)) return { status: err.status, location: err.location };
    throw err;
  }
  throw new Error('expected a redirect to be thrown');
}

describe('/dashboard → /maker alias', () => {
  test('index redirects to /maker (308), preserving query', () => {
    const r = captureRedirect(() =>
      loadIndex({ url: new URL('https://shippie.app/dashboard?claim_trial=trial-1') } as never),
    );
    expect(r.status).toBe(308);
    expect(r.location).toBe('/maker?claim_trial=trial-1');
  });

  test('index redirects bare /dashboard to /maker', () => {
    const r = captureRedirect(() => loadIndex({ url: new URL('https://shippie.app/dashboard') } as never));
    expect(r.status).toBe(308);
    expect(r.location).toBe('/maker');
  });

  test('catch-all preserves deep links and query', () => {
    const r = captureRedirect(() =>
      loadCatchAll({
        params: { path: 'apps/my-app/feedback' },
        url: new URL('https://shippie.app/dashboard/apps/my-app/feedback?status=open'),
      } as never),
    );
    expect(r.status).toBe(308);
    expect(r.location).toBe('/maker/apps/my-app/feedback?status=open');
  });

  test('catch-all with empty path maps to /maker', () => {
    const r = captureRedirect(() =>
      loadCatchAll({ params: { path: '' }, url: new URL('https://shippie.app/dashboard/') } as never),
    );
    expect(r.status).toBe(308);
    expect(r.location).toBe('/maker');
  });
});
