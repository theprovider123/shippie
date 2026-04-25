// apps/web/app/i/[code]/route.test.ts
// @ts-expect-error — local bun-test.d.ts shim omits `mock`; runtime has it.
import { describe, expect, test, mock } from 'bun:test';

mock.module('@/lib/access/short-links', () => ({
  resolveShortLink: async (code: string) => {
    if (code === 'abcd2345') return 'long-token-xyz';
    return null;
  },
  createShortLink: async () => ({ code: 'abcd2345' }),
  generateShortCode: () => 'abcd2345',
}));

const { GET } = await import('./route');

describe('/i/[code]', () => {
  test('rejects malformed codes with 404', async () => {
    const res = await GET(
      new Request('http://x/i/BAD!') as never,
      { params: Promise.resolve({ code: 'BAD!' }) } as never,
    );
    expect(res.status).toBe(404);
  });

  test('404 on unknown code', async () => {
    const res = await GET(
      new Request('http://x/i/nosuch99') as never,
      { params: Promise.resolve({ code: 'nosuch99' }) } as never,
    );
    expect(res.status).toBe(404);
  });

  test('302 redirect to /invite/{token} on hit', async () => {
    const res = await GET(
      new Request('http://x/i/abcd2345') as never,
      { params: Promise.resolve({ code: 'abcd2345' }) } as never,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('/invite/long-token-xyz');
  });
});
