import { describe, expect, test, vi } from 'vitest';
import { GET } from './+server';

const mocks = vi.hoisted(() => ({
  remixEligibilityForSlug: vi.fn(),
}));

vi.mock('$server/db/client', () => ({
  getDrizzleClient: () => ({}),
}));

vi.mock('$server/remix/eligibility', () => ({
  remixEligibilityForSlug: mocks.remixEligibilityForSlug,
}));

function eventFor(slug: string) {
  return {
    params: { slug },
    platform: { env: { DB: {} } },
  } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/apps/[slug]/remix', () => {
  test('returns source, license, fork URL, and deploy handoff commands', async () => {
    mocks.remixEligibilityForSlug.mockResolvedValueOnce({
      ok: true,
      app: {
        id: 'app_1',
        slug: 'recipe-saver',
        name: 'Recipe Saver',
        tagline: 'Cook from a shared pantry',
        sourceRepo: 'https://github.com/acme/recipe-saver.git',
        license: 'MIT',
        latestVersion: '3',
      },
    });

    const response = await GET(eventFor('recipe-saver'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      remix: {
        sourceRepo: string;
        license: string;
        forkUrl: string;
        deploy: { cli: string; mcp: { arguments: { remix_from: string } } };
      };
    };

    expect(body.remix.sourceRepo).toBe('https://github.com/acme/recipe-saver.git');
    expect(body.remix.license).toBe('MIT');
    expect(body.remix.forkUrl).toBe('https://github.com/acme/recipe-saver/fork');
    expect(body.remix.deploy.cli).toBe('shippie deploy ./dist --slug recipe-saver-remix --remix recipe-saver');
    expect(body.remix.deploy.mcp.arguments.remix_from).toBe('recipe-saver');
  });

  test('keeps non-GitHub sources remixable without a fork URL', async () => {
    mocks.remixEligibilityForSlug.mockResolvedValueOnce({
      ok: true,
      app: {
        id: 'app_2',
        slug: 'field-notes',
        name: 'Field Notes',
        tagline: null,
        sourceRepo: 'https://git.example.com/team/field-notes',
        license: 'Apache-2.0',
        latestVersion: null,
      },
    });

    const response = await GET(eventFor('field-notes'));
    const body = (await response.json()) as { remix: { forkUrl: string | null } };
    expect(body.remix.forkUrl).toBeNull();
  });

  test('surfaces eligibility failures before handing off source', async () => {
    mocks.remixEligibilityForSlug.mockResolvedValueOnce({
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
