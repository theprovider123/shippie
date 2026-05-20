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
  // Included so the mock surface matches the real module — other test files
  // that share this mock registry (e.g. invite.test.ts) won't break if run
  // together.
  getJson: async () => ({ invites: [] }),
  delJson: async () => ({ success: true }),
}));

const { wrapCommand } = await import('./wrap');

describe('shippie wrap', () => {
  test('is retired from the launch maker path', async () => {
    const out: string[] = [];
    await expect(wrapCommand({
      upstreamUrl: 'https://mevrouw.example.com',
      slug: 'mevrouw',
      apiUrl: 'https://shippie.app',
      name: 'Mevrouw',
      type: 'app',
      category: 'tools',
      log: (s) => out.push(s),
    })).rejects.toThrow(/wrap retired/);
    const joined = out.join('\n');
    expect(joined).toContain('no longer wraps hosted cloud apps');
    expect(joined).toContain('shippie deploy ./dist');
    expect(joined).toContain('local-tool policy scanner');
  });

  test('does not call the retired wrap endpoint', async () => {
    const bodies: unknown[] = [];
    mock.module('../api.js', () => ({
      postJson: async (_opts: { apiUrl: string }, _path: string, body: unknown) => {
        bodies.push(body);
        return {
          success: true,
          slug: (body as { slug: string }).slug,
          live_url: `https://${(body as { slug: string }).slug}.shippie.app/`,
          runtime_config: { required_redirect_uris: [] },
        };
      },
      getJson: async () => ({ invites: [] }),
      delJson: async () => ({ success: true }),
    }));
    const { wrapCommand: isolatedWrapCommand } = await import(`./wrap?case=${Date.now()}`);

    await expect(isolatedWrapCommand({
      upstreamUrl: 'https://mevrouw.example.com',
      slug: 'mevrouw-remix',
      apiUrl: 'https://shippie.app',
      remix: 'mevrouw',
      sourceRepo: 'https://github.com/acme/mevrouw-remix',
      license: 'MIT',
      remixable: true,
      log: () => {},
    })).rejects.toThrow(/Convert to shippie\.local\.db/);

    expect(bodies).toHaveLength(0);
  });
});
