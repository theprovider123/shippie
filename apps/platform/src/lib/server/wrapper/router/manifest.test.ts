import { describe, expect, test } from 'vitest';
import { handleManifest } from './manifest';
import type { WrapperContext } from '../env';

/**
 * Stub KV namespace just sturdy enough for handleManifest. Only the
 * `get(key)` shape is exercised — set/list/delete are not used here.
 */
function makeCache(entries: Record<string, unknown>): WrapperContext['env']['CACHE'] {
  const kv = new Map(
    Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)] as const),
  );
  return {
    get: async (key: string) => kv.get(key) ?? null,
  } as unknown as WrapperContext['env']['CACHE'];
}

function makeCtx(slug: string, entries: Record<string, unknown> = {}): WrapperContext {
  return {
    request: new Request('https://demo.shippie.app/__shippie/manifest'),
    env: {
      CACHE: makeCache(entries),
    } as unknown as WrapperContext['env'],
    slug,
    traceId: 'test-trace',
  };
}

async function read(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  return JSON.parse(text) as Record<string, unknown>;
}

describe('handleManifest — defaults when KV is empty', () => {
  test('falls back to slug as name + derived short_name', async () => {
    const res = await handleManifest(makeCtx('my-app'));
    const body = await read(res);
    expect(body.name).toBe('my-app');
    expect(body.short_name).toBe('my-app'); // ≤12 chars → returned as-is
    expect(body.id).toBe('/?app=my-app');
    expect(body.start_url).toBe('/');
    expect(body.scope).toBe('/');
    expect(body.display).toBe('standalone');
    expect(body.theme_color).toBe('#f97316'); // platform default
    expect(body.background_color).toBe('#ffffff');
  });

  test('returns 200 with application/manifest+json + 1h cache', async () => {
    const res = await handleManifest(makeCtx('any'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/manifest+json');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  test('always includes the 192/512/512-maskable icon triple', async () => {
    const body = await read(await handleManifest(makeCtx('any')));
    expect(body.icons).toEqual([
      { src: '/__shippie/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/__shippie/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/__shippie/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });

  test('omits screenshots / share_target / protocol_handlers when absent', async () => {
    const body = await read(await handleManifest(makeCtx('any')));
    expect('screenshots' in body).toBe(false);
    expect('share_target' in body).toBe(false);
    expect('protocol_handlers' in body).toBe(false);
  });
});

describe('handleManifest — AppProfile fills smart defaults', () => {
  test('inferredName fills name when meta absent', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('cookbook', {
          'apps:cookbook:profile': { inferredName: 'My Cookbook' },
        }),
      ),
    );
    expect(body.name).toBe('My Cookbook');
  });

  test('design.primaryColor seeds theme_color', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:profile': { design: { primaryColor: '#ff00aa' } },
        }),
      ),
    );
    expect(body.theme_color).toBe('#ff00aa');
  });

  test('design.backgroundColor seeds background_color', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:profile': { design: { backgroundColor: '#eeeeee' } },
        }),
      ),
    );
    expect(body.background_color).toBe('#eeeeee');
  });
});

describe('handleManifest — meta overrides profile', () => {
  test('meta.name beats profile.inferredName', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:profile': { inferredName: 'Inferred' },
          'apps:any:meta': { name: 'Maker Said So' },
        }),
      ),
    );
    expect(body.name).toBe('Maker Said So');
  });

  test('meta.theme_color beats profile.design.primaryColor', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:profile': { design: { primaryColor: '#000' } },
          'apps:any:meta': { theme_color: '#fff' },
        }),
      ),
    );
    expect(body.theme_color).toBe('#fff');
  });
});

describe('handleManifest — pwa overrides everything', () => {
  test('pwa.short_name beats derived', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('long-slug', {
          'apps:long-slug:pwa': { short_name: 'Snap' },
        }),
      ),
    );
    expect(body.short_name).toBe('Snap');
  });

  test('pwa.id / start_url / scope / display / orientation override defaults', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:pwa': {
            id: '/custom',
            start_url: '/launch',
            scope: '/scoped',
            display: 'fullscreen',
            orientation: 'landscape',
          },
        }),
      ),
    );
    expect(body.id).toBe('/custom');
    expect(body.start_url).toBe('/launch');
    expect(body.scope).toBe('/scoped');
    expect(body.display).toBe('fullscreen');
    expect(body.orientation).toBe('landscape');
  });

  test('pwa.share_target / screenshots / protocol_handlers spread when present', async () => {
    const share = { action: '/share', method: 'POST' as const, params: { title: 'title' } };
    const screens = [{ src: '/s.png', sizes: '1024x768', type: 'image/png' }];
    const protos = [{ protocol: 'web+myapp', url: '/handle?u=%s' }];
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:pwa': {
            share_target: share,
            screenshots: screens,
            protocol_handlers: protos,
          },
        }),
      ),
    );
    expect(body.share_target).toEqual(share);
    expect(body.screenshots).toEqual(screens);
    expect(body.protocol_handlers).toEqual(protos);
  });

  test('pwa.description overrides the default boilerplate', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', {
          'apps:any:pwa': { description: 'Maker description.' },
        }),
      ),
    );
    expect(body.description).toBe('Maker description.');
  });

  test('default description is "Built with Shippie." when pwa absent', async () => {
    const body = await read(await handleManifest(makeCtx('any')));
    expect(body.description).toBe('Built with Shippie.');
  });
});

describe('handleManifest — short_name derivation (via slug fallback)', () => {
  test('name ≤12 chars passes through', async () => {
    const body = await read(await handleManifest(makeCtx('short')));
    expect(body.short_name).toBe('short');
  });

  test('name >12 chars truncates to first word, max 12 chars', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', { 'apps:any:meta': { name: 'A Very Long Application Name' } }),
      ),
    );
    expect(body.short_name).toBe('A'); // first word "A"
  });

  test('long single word truncates to first 12 chars', async () => {
    const body = await read(
      await handleManifest(
        makeCtx('any', { 'apps:any:meta': { name: 'Supercalifragilistic' } }),
      ),
    );
    expect(body.short_name).toBe('Supercalifra');
    expect((body.short_name as string).length).toBe(12);
  });
});

describe('handleManifest — KV failure modes', () => {
  test('invalid JSON in any cache key falls through to defaults', async () => {
    const cache = {
      get: async (key: string) => {
        if (key === 'apps:any:meta') return '{not json';
        return null;
      },
    } as unknown as WrapperContext['env']['CACHE'];
    const ctx: WrapperContext = {
      request: new Request('https://demo.shippie.app/__shippie/manifest'),
      env: { CACHE: cache } as unknown as WrapperContext['env'],
      slug: 'any',
      traceId: 't',
    };
    const body = await read(await handleManifest(ctx));
    // Bad JSON → null → falls back to defaults.
    expect(body.name).toBe('any');
    expect(body.theme_color).toBe('#f97316');
  });
});
