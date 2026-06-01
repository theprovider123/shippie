import { describe, expect, test, vi } from 'vitest';
import { GET } from './+server';

const mocks = vi.hoisted(() => ({
  remixHandoffForSlug: vi.fn(),
  loadReservedSlugs: vi.fn(async () => new Set<string>()),
}));

vi.mock('$server/db/client', () => ({
  getDrizzleClient: () => ({}),
}));

vi.mock('$server/deploy/reserved-slugs', () => ({
  loadReservedSlugs: mocks.loadReservedSlugs,
}));

vi.mock('$server/remix/handoff', () => ({
  remixHandoffForSlug: mocks.remixHandoffForSlug,
}));

function eventFor(slug: string) {
  return {
    params: { slug },
    platform: { env: { DB: {} } },
  } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/apps/[slug]/remix', () => {
  test('returns source, license, fork URL, and deploy handoff commands', async () => {
    mocks.remixHandoffForSlug.mockResolvedValueOnce({
      ok: true,
      remix: {
        slug: 'recipe-saver',
        name: 'Recipe Saver',
        tagline: 'Cook from a shared pantry',
        sourceRepo: 'https://github.com/acme/recipe-saver',
        source: {
          webUrl: 'https://github.com/acme/recipe-saver',
          cloneUrl: 'https://github.com/acme/recipe-saver.git',
          forkUrl: 'https://github.com/acme/recipe-saver/fork',
          owner: 'acme',
          repo: 'recipe-saver',
          ref: null,
          path: null,
        },
        license: 'MIT',
        latestVersion: '3',
        forkUrl: 'https://github.com/acme/recipe-saver/fork',
        targetSlug: 'recipe-saver-remix-2',
        data: {
          family: 'recipe-saver',
          compatibility: 'unknown',
          note: 'Keep the same family.',
        },
        deploy: {
          cli: 'shippie deploy ./dist --slug recipe-saver-remix-2 --remix recipe-saver',
          mcp: {
            tool: 'deploy',
            arguments: {
              directory: '/absolute/path/to/dist',
              slug: 'recipe-saver-remix-2',
              remix_from: 'recipe-saver',
            },
          },
          workspace: {
            slug: 'recipe-saver-remix-2',
            directory: 'dist',
            remixFrom: 'recipe-saver',
          },
        },
      },
    });

    const response = await GET(eventFor('recipe-saver'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      remix: {
        sourceRepo: string;
        license: string;
        forkUrl: string;
        targetSlug: string;
        deploy: { cli: string; mcp: { arguments: { slug: string; remix_from: string } } };
      };
    };

    expect(body.remix.sourceRepo).toBe('https://github.com/acme/recipe-saver');
    expect(body.remix.license).toBe('MIT');
    expect(body.remix.forkUrl).toBe('https://github.com/acme/recipe-saver/fork');
    expect(body.remix.targetSlug).toBe('recipe-saver-remix-2');
    expect(body.remix.deploy.cli).toBe('shippie deploy ./dist --slug recipe-saver-remix-2 --remix recipe-saver');
    expect(body.remix.deploy.mcp.arguments.slug).toBe('recipe-saver-remix-2');
    expect(body.remix.deploy.mcp.arguments.remix_from).toBe('recipe-saver');
  });

  test('keeps non-GitHub sources remixable without a fork URL', async () => {
    mocks.remixHandoffForSlug.mockResolvedValueOnce({
      ok: true,
      remix: {
        slug: 'field-notes',
        name: 'Field Notes',
        tagline: null,
        sourceRepo: 'https://git.example.com/team/field-notes',
        source: {
          webUrl: 'https://git.example.com/team/field-notes',
          cloneUrl: 'https://git.example.com/team/field-notes',
          forkUrl: null,
          owner: null,
          repo: null,
          ref: null,
          path: null,
        },
        license: 'Apache-2.0',
        latestVersion: null,
        forkUrl: null,
        targetSlug: 'field-notes-remix',
        data: {
          family: null,
          compatibility: 'unknown',
          note: 'No family.',
        },
        deploy: {
          cli: 'shippie deploy ./dist --slug field-notes-remix --remix field-notes',
          mcp: {
            tool: 'deploy',
            arguments: {
              directory: '/absolute/path/to/dist',
              slug: 'field-notes-remix',
              remix_from: 'field-notes',
            },
          },
          workspace: {
            slug: 'field-notes-remix',
            directory: 'dist',
            remixFrom: 'field-notes',
          },
        },
      },
    });

    const response = await GET(eventFor('field-notes'));
    const body = (await response.json()) as { remix: { forkUrl: string | null } };
    expect(body.remix.forkUrl).toBeNull();
  });

  test('surfaces eligibility failures before handing off source', async () => {
    mocks.remixHandoffForSlug.mockResolvedValueOnce({
      ok: false,
      reason: 'The maker has not published source, license, and remix terms.',
    });

    const response = await GET(eventFor('closed-app'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'remix_unavailable',
      reason: 'The maker has not published source, license, and remix terms.',
    });
  });
});
