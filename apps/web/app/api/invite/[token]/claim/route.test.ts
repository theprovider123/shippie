// apps/web/app/api/invite/[token]/claim/route.test.ts
// @ts-expect-error — local bun-test.d.ts shim omits `mock`; runtime has it.
import { describe, expect, test, mock } from 'bun:test';

const mocks = {
  claim: async () => ({ success: true, appId: 'app-1', inviteId: 'inv-1', anonymous: true }),
};

mock.module('@/lib/access/invites', () => ({
  // @ts-expect-error — call signature differs from shim typing.
  claimInvite: (args: unknown) => mocks.claim.call(null, args as never),
  // Include other exports so co-execution with sibling tests (which share
  // bun's module-mock registry) doesn't break imports.
  createLinkInvite: async () => ({ id: 'inv-1', token: 'abc123def456' }),
  listInvites: async () => [],
  revokeInvite: async () => true,
}));
mock.module('@shippie/access/invite-cookie', () => ({
  signInviteGrant: async () => 'signed-token',
  inviteCookieName: (slug: string) => `__Secure-shippie_invite_${slug}`,
}));
mock.module('@/lib/db', () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ slug: 'mevrouw' }] }) }),
    }),
  }),
}));
mock.module('@/lib/auth', () => ({ auth: async () => null }));
mock.module('@/lib/env', () => ({ getInviteSecret: () => 'test-secret-32-bytes-padding-xxxx' }));

const { POST } = await import('./route');

describe('POST /api/invite/:token/claim', () => {
  test('anonymous claim sets cookie + returns redirect', async () => {
    const res = await POST(
      new Request('http://x', { method: 'POST' }) as never,
      { params: Promise.resolve({ token: 'abc' }) } as never,
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('__Secure-shippie_invite_mevrouw');
    const body = await res.json();
    expect(body.redirect_to).toMatch(/mevrouw\./);
  });
});
