import { describe, expect, test } from 'vitest';
import { GET } from './+server';

function eventFor(slug: string): Parameters<typeof GET>[0] {
  return {
    params: { slug },
    url: new URL(`https://shippie.app/api/apps/${encodeURIComponent(slug)}/og.svg`),
    platform: undefined,
  } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/apps/[slug]/og.svg', () => {
  test('renders an app-specific card for a first-party app', async () => {
    const response = await GET(eventFor('golazo'));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
    expect(body).toContain('Golazo');
    expect(body).toContain('shippie.app/golazo');
    expect(body).toContain('SHARED ON SHIPPIE');
  });

  test('canonicalizes old first-party aliases in the card URL', async () => {
    const response = await GET(eventFor('recipe'));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('Palate');
    expect(body).toContain('shippie.app/palate');
  });

  test('does not generate misleading cards for unknown slugs', async () => {
    const response = await GET(eventFor('not-a-real-app'));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
