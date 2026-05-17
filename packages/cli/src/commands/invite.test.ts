import { describe, expect, test } from 'bun:test';
import * as bunTest from 'bun:test';

const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;

mock.module('../api.js', () => ({
  postJson: async (_opts: unknown, path: string, body: Record<string, unknown>) => {
    const url = new URL(`https://shippie.app${path}`);
    if (typeof body.space_id === 'string') url.searchParams.set('space', body.space_id);
    if (typeof body.space_role === 'string') url.searchParams.set('role', body.space_role);
    if (typeof body.space_join === 'string') url.searchParams.set('space_join', body.space_join);
    if (typeof body.space_id === 'string') url.searchParams.set('space_sig', 'signed-by-platform');
    return {
      invite: { id: 'i-1', token: 'tok123' },
      url: url.toString(),
    };
  },
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

  test('create can append private space context', async () => {
    const out: string[] = [];
    await inviteCreate({
      slug: 'match-room',
      apiUrl: 'http://x',
      spaceId: 'space_pub_final',
      role: 'viewer',
      joinToken: 'join_abc123',
      log: (s) => out.push(s),
    });
    const joined = out.join('\n');
    expect(joined).toContain('space=space_pub_final');
    expect(joined).toContain('role=viewer');
    expect(joined).toContain('space_join=join_abc123');
    expect(joined).toContain('space_sig=signed-by-platform');
    expect(joined).toContain('space_pub_final (viewer)');
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
