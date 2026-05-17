import { describe, expect, test } from 'bun:test';
import { fetchRemixInfo } from './remix.ts';

describe('fetchRemixInfo', () => {
  test('normalizes the public remix handoff', async () => {
    const calls: string[] = [];
    const remix = await fetchRemixInfo(
      {
        apiUrl: 'https://example.com/',
        fetchImpl: (async (input) => {
          calls.push(String(input));
          return new Response(
            JSON.stringify({
              remix: {
                slug: 'recipe-saver',
                name: 'Recipe Saver',
                sourceRepo: 'https://github.com/acme/recipe-saver',
                license: 'MIT',
                forkUrl: 'https://github.com/acme/recipe-saver/fork',
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }) as typeof fetch,
      },
      'recipe-saver',
    );

    expect(calls).toEqual(['https://example.com/api/apps/recipe-saver/remix']);
    expect(remix.deploy.cli).toBe('shippie deploy ./dist --slug recipe-saver-remix --remix recipe-saver');
    expect(remix.deploy.mcp.arguments.remix_from).toBe('recipe-saver');
    expect(remix.deploy.workspace).toEqual({
      slug: 'recipe-saver-remix',
      directory: 'dist',
      remixFrom: 'recipe-saver',
    });
  });

  test('surfaces unavailable remix reasons', async () => {
    await expect(
      fetchRemixInfo(
        {
          apiUrl: 'https://example.com',
          fetchImpl: (async () =>
            new Response(
              JSON.stringify({
                error: 'remix_unavailable',
                reason: 'The maker has not published source, license, and remix terms.',
              }),
              { status: 400, headers: { 'content-type': 'application/json' } },
            )) as typeof fetch,
        },
        'private-app',
      ),
    ).rejects.toThrow('remix_unavailable: The maker has not published source, license, and remix terms.');
  });
});
