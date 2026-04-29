import { describe, expect, test } from 'bun:test';
import { fetchAppConfig, resetAppConfig, updateAppConfig } from './config.ts';

describe('app config core', () => {
  test('requires a token', async () => {
    await expect(fetchAppConfig({ apiUrl: 'https://example.com', token: null }, 'recipe')).rejects.toThrow(
      'no_auth_token',
    );
  });

  test('reads config overrides', async () => {
    const calls: Array<{ url: string; method: string; auth: string | null }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        auth: init?.headers instanceof Headers
          ? init.headers.get('authorization')
          : (init?.headers as Record<string, string> | undefined)?.authorization ?? null,
      });
      return Response.json({
        slug: 'recipe',
        config: { themeColor: '#E8603C', sound: true },
        has_override: true,
      });
    }) as unknown as typeof fetch;

    await expect(
      fetchAppConfig({ apiUrl: 'https://example.com/', token: 'tok', fetchImpl }, 'recipe'),
    ).resolves.toEqual({
      slug: 'recipe',
      config: { themeColor: '#E8603C', sound: true },
      hasOverride: true,
    });
    expect(calls).toEqual([
      {
        url: 'https://example.com/api/apps/recipe/config',
        method: 'GET',
        auth: 'Bearer tok',
      },
    ]);
  });

  test('updates and resets config overrides', async () => {
    const calls: Array<{ method: string; body?: string }> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return Response.json({ slug: 'recipe', config: {}, has_override: false });
    }) as unknown as typeof fetch;

    await updateAppConfig(
      { apiUrl: 'https://example.com', token: 'tok', fetchImpl },
      'recipe',
      { sound: false },
    );
    await resetAppConfig({ apiUrl: 'https://example.com', token: 'tok', fetchImpl }, 'recipe');

    expect(calls).toEqual([
      { method: 'PATCH', body: JSON.stringify({ config: { sound: false } }) },
      { method: 'DELETE', body: undefined },
    ]);
  });

  test('surfaces authentication failures', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 })) as unknown as typeof fetch;

    await expect(
      fetchAppConfig({ apiUrl: 'https://example.com', token: 'bad', fetchImpl }, 'recipe'),
    ).rejects.toThrow('unauthenticated');
  });
});
