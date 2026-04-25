// apps/web/app/api/apps/[slug]/invites/route.test.ts
// @ts-expect-error — local bun-test.d.ts shim omits `mock`; runtime has it.
import { describe, expect, test, mock } from 'bun:test';

mock.module('@/lib/auth', () => ({
  auth: async () => ({ user: { id: '00000000-0000-0000-0000-000000000001' } }),
}));
mock.module('@/lib/access/invites', () => ({
  createLinkInvite: async () => ({ id: 'inv-1', token: 'abc123def456' }),
  listInvites: async () => [
    { id: 'inv-1', token: 'abc123def456', kind: 'link', usedCount: 0 },
  ],
}));
mock.module('@/lib/access/short-links', () => ({
  createShortLink: async () => ({ code: 'abcd2345' }),
}));
mock.module('@/lib/db', () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            { id: 'app-1', makerId: '00000000-0000-0000-0000-000000000001' },
          ],
        }),
      }),
    }),
  }),
}));

const { GET, POST } = await import('./route');

describe('/api/apps/[slug]/invites', () => {
  test('POST creates and returns url', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'link' }),
      }) as never,
      { params: Promise.resolve({ slug: 'mevrouw' }) } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invite.token).toBe('abc123def456');
    expect(body.url).toBe('https://shippie.app/invite/abc123def456');
    expect(body.short_url).toBe('https://shippie.app/i/abcd2345');
  });

  test('GET lists invites', async () => {
    const res = await GET(
      new Request('http://x') as never,
      { params: Promise.resolve({ slug: 'mevrouw' }) } as never,
    );
    const body = await res.json();
    expect(body.invites).toHaveLength(1);
  });
});
