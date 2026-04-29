import { describe, expect, test } from 'bun:test';
import { fetchAppsList } from './apps.ts';

describe('fetchAppsList', () => {
  test('requires a token', async () => {
    await expect(fetchAppsList({ apiUrl: 'https://example.com', token: null })).rejects.toThrow(
      'no_auth_token',
    );
  });

  test('fetches and normalizes maker apps', async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        auth: init?.headers instanceof Headers
          ? init.headers.get('authorization')
          : (init?.headers as Record<string, string> | undefined)?.authorization ?? null,
      });
      return new Response(
        JSON.stringify({
          apps: [
            {
              slug: 'recipe',
              name: 'Recipe',
              status: 'live',
              kind: 'local',
              live_url: 'https://recipe.shippie.app/',
              visibility: 'public',
              updated_at: '2026-04-29T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    await expect(
      fetchAppsList({ apiUrl: 'https://example.com/', token: 'tok', fetchImpl }),
    ).resolves.toEqual([
      {
        slug: 'recipe',
        name: 'Recipe',
        status: 'live',
        kind: 'local',
        liveUrl: 'https://recipe.shippie.app/',
        visibility: 'public',
        updatedAt: '2026-04-29T00:00:00.000Z',
      },
    ]);
    expect(calls).toEqual([{ url: 'https://example.com/api/apps', auth: 'Bearer tok' }]);
  });

  test('surfaces authentication failures', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 })) as unknown as typeof fetch;

    await expect(
      fetchAppsList({ apiUrl: 'https://example.com', token: 'bad', fetchImpl }),
    ).rejects.toThrow('unauthenticated');
  });
});
