import { describe, expect, test, vi } from 'vitest';
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { handle } from './hooks.server';

function fakeKv(): KVNamespace {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({
      value: null,
      metadata: null,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

function emptyR2(): R2Bucket {
  return {
    get: async () => null,
    head: async () => null,
    put: async () => null,
    delete: async () => undefined,
    list: async () => ({
      objects: [],
      truncated: false,
      delimitedPrefixes: [],
    }),
  } as unknown as R2Bucket;
}

function fakeAssets(files: Record<string, string> = {}) {
  return {
    fetch: async (input: URL | RequestInfo) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const body = files[url.pathname];
      if (body === undefined) return new Response('missing', { status: 404 });
      return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  };
}

function eventFor(url: string, init: { assets?: { fetch: typeof fetch } } = {}) {
  const assets = init.assets ?? fakeAssets();
  return {
    url: new URL(url),
    request: new Request(url, { headers: { host: new URL(url).host } }),
    fetch: (input: URL | RequestInfo) => assets.fetch(input),
    platform: {
      env: {
        DB: {} as never,
        APPS: emptyR2(),
        PLATFORM_ASSETS: emptyR2(),
        ASSETS: assets,
        CACHE: fakeKv(),
        SHIPPIE_ENV: 'test',
        PUBLIC_ORIGIN: 'http://test.invalid',
        INVITE_SECRET: 'test-invite',
      },
    },
    locals: {},
    cookies: {
      get: () => undefined,
      set: () => undefined,
    },
  };
}

describe('hooks.server first-party showcase routing', () => {
  test('first-party showcase subdomains serve __shippie system routes instead of redirecting into /run', async () => {
    const resolve = vi.fn(async () => new Response('fallthrough'));
    const res = await handle({
      event: eventFor('https://recipe.shippie.app/__shippie/health') as never,
      resolve,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
    const body = (await res.json()) as { ok: boolean; slug: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe('palate');
  });

  test('bare /run/<slug>/ falls through to the focused SvelteKit page', async () => {
    const resolve = vi.fn(async () => new Response('focused page'));
    const res = await handle({
      event: eventFor('https://shippie.app/run/recipe/') as never,
      resolve,
    });

    expect(await res.text()).toBe('focused page');
    expect(resolve).toHaveBeenCalledOnce();
  });

  test('nested /__shippie-run/<slug>/ assets are served from the Workers Assets binding', async () => {
    const resolve = vi.fn(async () => new Response('fallthrough'));
    const res = await handle({
      event: eventFor('https://shippie.app/__shippie-run/recipe/index.html?shippie_embed=1', {
        assets: fakeAssets({ '/__shippie-run/recipe/index.html': '<h1>Recipe asset</h1>' }),
      }) as never,
      resolve,
    });

    expect(await res.text()).toBe('<h1>Recipe asset</h1>');
    expect(resolve).not.toHaveBeenCalled();
  });

  test('local /__shippie-run/<slug>/ directory requests fall back to static index HTML', async () => {
    const resolve = vi.fn(async () => new Response('fallthrough'));
    const res = await handle({
      event: eventFor('http://127.0.0.1:4102/__shippie-run/recipe/?shippie_embed=1', {
        assets: fakeAssets({ '/__shippie-run/recipe/index.html': '<h1>Recipe local SPA</h1>' }),
      }) as never,
      resolve,
    });

    expect(await res.text()).toBe('<h1>Recipe local SPA</h1>');
    expect(resolve).not.toHaveBeenCalled();
  });

  test('nested /__shippie-run/<slug>/ app paths fall back to the app index HTML', async () => {
    const resolve = vi.fn(async () => new Response('fallthrough'));
    const res = await handle({
      event: eventFor('https://shippie.app/__shippie-run/recipe/recipes/42', {
        assets: fakeAssets({ '/__shippie-run/recipe/index.html': '<h1>Recipe SPA</h1>' }),
      }) as never,
      resolve,
    });

    expect(await res.text()).toBe('<h1>Recipe SPA</h1>');
    expect(resolve).not.toHaveBeenCalled();
  });

  // Slate v4 Phase 0 alias coverage. Each consolidation pair has an
  // entry in SLUG_ALIASES (live-room→match-room, care-log→co-pilot,
  // journal→therapy-notes, move→lift). A request to the OLD slug's
  // subdomain must 302 to the CANONICAL `/run/<successor>/` so old
  // shortcuts visibly migrate. The bare `/run/<old>/` 302 lives in
  // routes/run/[slug]/+page.server.ts (covered by its own test); this
  // covers the subdomain-edge path.
  for (const [oldSlug, location] of [
    ['live-room', 'https://shippie.app/run/match-room/?from=live-room'],
    ['show-and-tell', 'https://shippie.app/run/whiteboard/?mode=show-and-tell&from=show-and-tell'],
    ['would-you-rather', 'https://shippie.app/run/drawing-telephone/?pack=would-you-rather&from=would-you-rather'],
    ['matchday', 'match-room'],
    ['care-log', 'co-pilot'],
    ['journal', 'therapy-notes'],
    ['move', 'lift'],
    ['shopping-list', 'https://shippie.app/run/palate/?tab=shop&from=shopping-list'],
    ['meal-planner', 'https://shippie.app/run/palate/?tab=plan&from=meal-planner'],
    ['pantry-scanner', 'https://shippie.app/run/palate/?tab=pantry&from=pantry-scanner'],
  ] as const) {
    test(`subdomain ${oldSlug}.shippie.app/ 302s to canonical successor`, async () => {
      const resolve = vi.fn(async () => new Response('fallthrough'));
      const res = await handle({
        event: eventFor(`https://${oldSlug}.shippie.app/`) as never,
        resolve,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        location.startsWith('https://') ? location : `https://shippie.app/run/${location}/`,
      );
      expect(resolve).not.toHaveBeenCalled();
    });
  }

  for (const [oldSlug, mode] of [
    ['sudoku', 'sudoku'],
    ['memory-grid', 'memory-grid'],
    ['reaction', 'reaction'],
  ] as const) {
    test(`subdomain ${oldSlug}.shippie.app/ 302s to Daily Puzzle mode`, async () => {
      const resolve = vi.fn(async () => new Response('fallthrough'));
      const res = await handle({
        event: eventFor(`https://${oldSlug}.shippie.app/?invite=abc`) as never,
        resolve,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        `https://shippie.app/run/daily-puzzle/?invite=abc&mode=${mode}&from=${oldSlug}`,
      );
      expect(resolve).not.toHaveBeenCalled();
    });
  }

});
