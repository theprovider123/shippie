/**
 * Tests for POST /api/deploy/wrap.
 *
 * Mocks `resolveUserId`, `createWrappedApp`, and `loadReservedSlugs` via
 * `mock.module` so we can exercise the happy/sad path without standing up
 * Postgres or the full auth stack. The DB isn't touched; `createWrappedApp`
 * is mocked to return a fixed success shape.
 */
import { describe, expect, test, beforeEach } from 'bun:test';
// `mock` isn't in this app's local bun:test shim; import dynamically
// with a minimal local type so the test typechecks without touching the
// shared shim.
import * as bunTest from 'bun:test';
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;

mock.module('@/lib/cli-auth', () => ({
  resolveUserId: async () => ({ userId: '00000000-0000-0000-0000-000000000001' }),
}));
mock.module('@/lib/deploy/wrap', () => ({
  createWrappedApp: async (input: { slug: string }) => ({
    success: true,
    slug: input.slug,
    appId: 'app-id',
    deployId: 'deploy-id',
    liveUrl: `https://${input.slug}.shippie.app/`,
    runtimeConfig: {
      requiredRedirectUris: [`https://${input.slug}.shippie.app/api/auth/callback`],
    },
  }),
}));
mock.module('@/lib/deploy/reserved-slugs', () => ({
  loadReservedSlugs: async () => new Set<string>(),
}));

const { POST } = await import('./route.ts');

// Each test uses a unique user id so the token-bucket rate limiter (keyed
// by user id) doesn't bleed between tests.
let userCounter = 0;
beforeEach(() => {
  userCounter += 1;
  const id = `00000000-0000-0000-0000-${String(userCounter).padStart(12, '0')}`;
  mock.module('@/lib/cli-auth', () => ({
    resolveUserId: async () => ({ userId: id }),
  }));
});

describe('POST /api/deploy/wrap', () => {
  test('happy path returns success + live_url', async () => {
    const res = await POST(
      new Request('http://x/api/deploy/wrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'mevrouw',
          upstream_url: 'https://mevrouw.vercel.app',
          name: 'Mevrouw',
          type: 'app',
          category: 'tools',
        }),
      }) as never,
      undefined as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      live_url: string;
      runtime_config: { required_redirect_uris: string[] };
    };
    expect(body.success).toBe(true);
    expect(body.live_url).toBe('https://mevrouw.shippie.app/');
    expect(body.runtime_config.required_redirect_uris).toHaveLength(1);
  });

  test('rejects missing slug with 400', async () => {
    const res = await POST(
      new Request('http://x/api/deploy/wrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upstream_url: 'https://x.com' }),
      }) as never,
      undefined as never,
    );
    expect(res.status).toBe(400);
  });
});
