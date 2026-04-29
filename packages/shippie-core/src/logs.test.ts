import { describe, expect, test } from 'bun:test';
import { fetchLogs } from './logs.ts';

describe('fetchLogs', () => {
  test('requires a token', async () => {
    await expect(fetchLogs({ apiUrl: 'https://example.com', token: null })).rejects.toThrow(
      'no_auth_token',
    );
  });

  test('fetches and normalizes privacy-preserving log summaries', async () => {
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
          feedback: [
            {
              id: 'fb_1',
              app_slug: 'recipe',
              app_name: 'Recipe',
              type: 'idea',
              status: 'open',
              rating: 5,
              title: 'Filters',
              body: 'Can we filter by time?',
              vote_count: 3,
              created_at: '2026-04-29T00:00:00.000Z',
              user_id: 'must-not-surface',
            },
          ],
          usage: [
            {
              app_slug: 'recipe',
              app_name: 'Recipe',
              day: '2026-04-29',
              event_type: 'open',
              count: 42,
              session_id: 'must-not-surface',
            },
          ],
          functions: [
            {
              id: 'fn_1',
              app_slug: 'recipe',
              app_name: 'Recipe',
              function_name: 'score',
              method: 'POST',
              status: 500,
              duration_ms: 17,
              error: 'boom',
              created_at: '2026-04-29T00:01:00.000Z',
              metadata: { requestBody: 'must-not-surface' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    await expect(
      fetchLogs({ apiUrl: 'https://example.com/', token: 'tok', fetchImpl }, { slug: 'recipe', limit: 5 }),
    ).resolves.toEqual({
      feedback: [
        {
          id: 'fb_1',
          appSlug: 'recipe',
          appName: 'Recipe',
          type: 'idea',
          status: 'open',
          rating: 5,
          title: 'Filters',
          body: 'Can we filter by time?',
          voteCount: 3,
          createdAt: '2026-04-29T00:00:00.000Z',
        },
      ],
      usage: [
        {
          appSlug: 'recipe',
          appName: 'Recipe',
          day: '2026-04-29',
          eventType: 'open',
          count: 42,
        },
      ],
      functions: [
        {
          id: 'fn_1',
          appSlug: 'recipe',
          appName: 'Recipe',
          functionName: 'score',
          method: 'POST',
          status: 500,
          durationMs: 17,
          error: 'boom',
          createdAt: '2026-04-29T00:01:00.000Z',
        },
      ],
    });

    expect(calls).toEqual([
      {
        url: 'https://example.com/api/logs?slug=recipe&limit=5',
        auth: 'Bearer tok',
      },
    ]);
  });

  test('surfaces authentication failures', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 })) as unknown as typeof fetch;

    await expect(
      fetchLogs({ apiUrl: 'https://example.com', token: 'bad', fetchImpl }),
    ).rejects.toThrow('unauthenticated');
  });
});
