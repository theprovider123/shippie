import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { GET } from './+server';

const STATIC_DIR = fileURLToPath(new URL('../../../../../../static/__shippie/', import.meta.url));

/**
 * Stand-in event: no platform (curated-app fallback, no ASSETS binding) and
 * an event.fetch that serves the real static wasm/font from disk — the same
 * injection seam the Worker uses, fed from fs instead of Workers Assets.
 */
function eventFor(slug: string): Parameters<typeof GET>[0] {
  return {
    params: { slug },
    url: new URL(`https://shippie.app/api/apps/${encodeURIComponent(slug)}/og.png`),
    platform: undefined,
    fetch: (async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
      if (path === '/__shippie/resvg.wasm') {
        return new Response(new Uint8Array(await readFile(`${STATIC_DIR}resvg.wasm`)));
      }
      if (path === '/__shippie/og-font.ttf') {
        return new Response(new Uint8Array(await readFile(`${STATIC_DIR}og-font.ttf`)));
      }
      // App icons etc. — unavailable in tests; the card renders without them.
      return new Response('not found', { status: 404 });
    }) as typeof fetch,
  } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/apps/[slug]/og.png', () => {
  test('rasterizes the first-party card to a real PNG', async () => {
    const response = await GET(eventFor('golazo'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('max-age=3600');

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  test('keeps the og.svg visibility gating — unknown slugs 404', async () => {
    const response = await GET(eventFor('not-a-real-app'));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
