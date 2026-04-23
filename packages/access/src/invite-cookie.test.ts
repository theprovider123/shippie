import { describe, expect, test } from 'bun:test';
import { signInviteGrant, verifyInviteGrant, inviteCookieName } from './invite-cookie.ts';

const SECRET = 'test-secret-32bytes-aaaaaaaaaaaaaaaa';

describe('invite cookie', () => {
  test('sign + verify roundtrip', async () => {
    const token = await signInviteGrant(
      {
        sub: 'anon-1',
        app: 'mevrouw',
        tok: 'inv-1',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      SECRET,
    );
    const verified = await verifyInviteGrant(token, SECRET);
    expect(verified?.app).toBe('mevrouw');
    expect(verified?.sub).toBe('anon-1');
  });

  test('rejects expired grant', async () => {
    const token = await signInviteGrant(
      {
        sub: 'a',
        app: 'x',
        tok: 't',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) - 10,
      },
      SECRET,
    );
    const verified = await verifyInviteGrant(token, SECRET);
    expect(verified).toBeNull();
  });

  test('rejects tampered token', async () => {
    const token = await signInviteGrant(
      {
        sub: 'a',
        app: 'x',
        tok: 't',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      SECRET,
    );
    const tampered = token.slice(0, -2) + 'XX';
    const verified = await verifyInviteGrant(tampered, SECRET);
    expect(verified).toBeNull();
  });

  test('cookie name in prod uses __Secure- prefix', () => {
    expect(inviteCookieName('mevrouw', { secure: true })).toBe('__Secure-shippie_invite_mevrouw');
  });

  test('cookie name in dev omits __Secure- prefix (http localhost rejects it)', () => {
    expect(inviteCookieName('mevrouw', { secure: false })).toBe('shippie_invite_mevrouw');
  });
});
