/**
 * Tests for `shippie wrap <upstream-url>`.
 *
 * Mocks the shared `../api.js` helper so we don't hit the network.
 * Note: the real `postJson` is 3-arg — (opts, path, body) — so our mock
 * must match that signature.
 */
import { describe, expect, test, mock } from 'bun:test';

mock.module('../api.js', () => ({
  postJson: async (_opts: { apiUrl: string }, _path: string, body: unknown) => ({
    success: true,
    slug: (body as { slug: string }).slug,
    live_url: `https://${(body as { slug: string }).slug}.shippie.app/`,
    runtime_config: {
      required_redirect_uris: [
        `https://${(body as { slug: string }).slug}.shippie.app/api/auth/callback`,
      ],
    },
  }),
}));

const { wrapCommand } = await import('./wrap');

describe('shippie wrap', () => {
  test('success path prints slug, live URL, redirect URI', async () => {
    const out: string[] = [];
    await wrapCommand({
      upstreamUrl: 'https://mevrouw.vercel.app',
      slug: 'mevrouw',
      apiUrl: 'https://shippie.app',
      name: 'Mevrouw',
      type: 'app',
      category: 'tools',
      log: (s) => out.push(s),
    });
    const joined = out.join('\n');
    expect(joined).toContain('wrapped');
    expect(joined).toContain('mevrouw');
    expect(joined).toContain('https://mevrouw.shippie.app/');
    expect(joined).toContain('https://mevrouw.shippie.app/api/auth/callback');
  });
});
