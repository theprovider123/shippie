import { describe, expect, test } from 'bun:test';
import * as bunTest from 'bun:test';

const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;

mock.module('../api.js', () => ({
  postJson: async (_opts: unknown, path: string) => ({
    invite: { id: 'i-1', token: 'tok123' },
    url: `https://shippie.app${path}`,
  }),
  getJson: async (_opts: unknown, _path: string) => ({
    invites: [
      {
        id: 'i-1',
        token: 'tok123',
        kind: 'link',
        usedCount: 0,
        maxUses: null,
      },
    ],
  }),
  delJson: async () => ({ success: true }),
}));

const { inviteCreate, inviteList, inviteRevoke } = await import('./invite.ts');

describe('invite CLI', () => {
  test('create prints URL + token', async () => {
    const out: string[] = [];
    await inviteCreate({ slug: 'mevrouw', apiUrl: 'http://x', log: (s) => out.push(s) });
    const joined = out.join('\n');
    expect(joined).toContain('tok123');
    expect(joined).toContain('https://shippie.app');
  });

  test('list shows active invites', async () => {
    const out: string[] = [];
    await inviteList({ slug: 'mevrouw', apiUrl: 'http://x', log: (s) => out.push(s) });
    expect(out.join('\n')).toContain('tok123');
  });

  test('revoke calls DELETE and logs revoked', async () => {
    const out: string[] = [];
    await inviteRevoke({
      slug: 'mevrouw',
      id: 'i-1',
      apiUrl: 'http://x',
      log: (s) => out.push(s),
    });
    expect(out.join('\n')).toContain('revoked');
  });
});
