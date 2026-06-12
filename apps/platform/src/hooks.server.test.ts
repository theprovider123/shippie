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

  test('apex __shippie system routes preserve the synthetic shell analytics slug', async () => {
    const resolve = vi.fn(async () => new Response('fallthrough'));
    const res = await handle({
      event: eventFor('https://shippie.app/__shippie/meta?slug=__shippie_shell__') as never,
      resolve,
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe('__shippie_shell__');
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

  // Slate alias coverage. Retired-but-baked apps keep explicit
  // redirects so old shortcuts visibly migrate. Private flagships and
  // live arcade games stay canonical and are not aliased here.
  for (const [oldSlug, location] of [
    ['live-room', 'https://shippie.app/match-room?from=live-room'],
    ['show-and-tell', 'https://shippie.app/whiteboard?mode=show-and-tell&from=show-and-tell'],
    ['matchday', 'match-room'],
    ['move', 'lift'],
    ['habit-tracker', 'https://shippie.app/chiwit?tab=track&from=habit-tracker'],
    ['shopping-list', 'https://shippie.app/palate?tab=shop&from=shopping-list'],
    ['meal-planner', 'https://shippie.app/palate?tab=plan&from=meal-planner'],
    ['pantry-scanner', 'https://shippie.app/palate?tab=pantry&from=pantry-scanner'],
    ['body-metrics', 'https://shippie.app/lift?from=body-metrics'],
    ['breath', 'https://shippie.app/quiet?from=breath'],
    ['colour-of-day', 'https://shippie.app/chiwit?tab=track&from=colour-of-day'],
  ] as const) {
    test(`subdomain ${oldSlug}.shippie.app/ 302s to canonical successor`, async () => {
      const resolve = vi.fn(async () => new Response('fallthrough'));
      const res = await handle({
        event: eventFor(`https://${oldSlug}.shippie.app/`) as never,
        resolve,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        location.startsWith('https://') ? location : `https://shippie.app/${location}`,
      );
      expect(resolve).not.toHaveBeenCalled();
    });
  }

});
