import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({
  resolveRequestUserId: vi.fn(async () => ({ userId: 'user-1' })),
  createWrappedApp: vi.fn(),
  loadReservedSlugs: vi.fn(async () => new Set<string>()),
  remixEligibilityForSlug: vi.fn(),
}));

vi.mock('$server/auth/resolve-user', () => ({
  resolveRequestUserId: mocks.resolveRequestUserId,
}));

vi.mock('$server/deploy/wrap', () => ({
  createWrappedApp: mocks.createWrappedApp,
}));

vi.mock('$server/deploy/reserved-slugs', () => ({
  loadReservedSlugs: mocks.loadReservedSlugs,
}));

vi.mock('$server/remix/eligibility', () => ({
  remixEligibilityForSlug: mocks.remixEligibilityForSlug,
}));

vi.mock('$server/db/client', () => ({
  schema: {
    organizations: { id: 'organizations.id', slug: 'organizations.slug' },
    organizationMembers: {
      role: 'organizationMembers.role',
      orgId: 'organizationMembers.orgId',
      userId: 'organizationMembers.userId',
    },
  },
  getDrizzleClient: () => ({}),
}));

vi.mock('drizzle-orm', () => ({
  and: () => ({}),
  eq: () => ({}),
  or: () => ({}),
}));

function eventFor(body: Record<string, unknown>) {
  return {
    request: new Request('https://shippie.app/api/deploy/wrap', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    platform: {
      env: {
        DB: {},
        CACHE: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/deploy/wrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('preserves remix lineage and source metadata for wrapped apps', async () => {
    mocks.createWrappedApp.mockResolvedValueOnce({
      success: true,
      slug: 'recipe-saver-web',
      deployId: 'deploy-1',
      liveUrl: 'https://recipe-saver-web.shippie.app/',
      runtimeConfig: { requiredRedirectUris: [] },
    });
    mocks.remixEligibilityForSlug.mockResolvedValueOnce({
      ok: true,
      app: {
        id: 'app-parent',
        latestVersion: '7',
        license: 'MIT',
      },
    });

    const response = await POST(eventFor({
      slug: 'recipe-saver-web',
      upstream_url: 'https://recipes.example.com',
      name: 'Recipe Saver Web',
      remix_from: 'recipe-saver',
      source_repo: 'https://github.com/acme/recipe-saver-web',
      license: 'Apache-2.0',
      remix_allowed: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.remixEligibilityForSlug).toHaveBeenCalledWith(expect.anything(), 'recipe-saver');
    expect(mocks.createWrappedApp).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'recipe-saver-web',
        upstreamUrl: 'https://recipes.example.com',
        lineage: {
          parentAppId: 'app-parent',
          parentVersion: '7',
          sourceRepo: 'https://github.com/acme/recipe-saver-web',
          license: 'Apache-2.0',
          remixAllowed: true,
        },
      }),
    );
  });

  test('requires source and license before marking a wrapped app remixable', async () => {
    const response = await POST(eventFor({
      slug: 'closed-web',
      upstream_url: 'https://closed.example.com',
      name: 'Closed Web',
      remix_allowed: true,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'remix_metadata_required',
    });
    expect(mocks.createWrappedApp).not.toHaveBeenCalled();
  });
});
