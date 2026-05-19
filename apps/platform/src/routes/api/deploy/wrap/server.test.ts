import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({
  resolveRequestUserId: vi.fn<() => Promise<{ userId: string } | null>>(async () => ({ userId: 'user-1' })),
}));

vi.mock('$server/auth/resolve-user', () => ({
  resolveRequestUserId: mocks.resolveRequestUserId,
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

  test('retired URL wraps with local-tool conversion guidance', async () => {
    const response = await POST(eventFor({
      slug: 'recipe-saver-web',
      upstream_url: 'https://recipes.example.com',
      name: 'Recipe Saver Web',
    }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: 'wrap_retired',
      alternatives: expect.arrayContaining([
        expect.stringContaining('shippie.local.db'),
      ]),
    });
  });

  test('still requires a maker identity before returning policy guidance', async () => {
    mocks.resolveRequestUserId.mockResolvedValueOnce(null);

    const response = await POST(eventFor({
      slug: 'recipe-saver-web',
      upstream_url: 'https://recipes.example.com',
      name: 'Recipe Saver Web',
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthenticated' });
  });
});
