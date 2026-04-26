/**
 * Ported from services/worker/src/router/access-gate.test.ts.
 */
import { describe, expect, test } from 'vitest';
import { runAccessGate } from './access-gate';
import {
  signInviteGrant,
  inviteCookieName
} from '@shippie/access/invite-cookie';
import type { WrapperEnv } from '../env';

const SECRET = 'test-secret-32bytes-aaaaaaaaaaaaaaaa';

function envWith(secret: string | undefined): WrapperEnv {
  return {
    DB: {} as never,
    APPS: {} as never,
    ASSETS: undefined,
    PLATFORM_ASSETS: {} as never,
    CACHE: {} as never,
    SHIPPIE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://test.invalid',
    INVITE_SECRET: secret
  };
}

function ctxFor(slug: string, cookie?: string) {
  return {
    request: new Request(`http://${slug}.localhost/`, {
      headers: cookie ? { cookie } : {}
    }),
    env: envWith(SECRET),
    slug,
    traceId: 't'
  };
}

describe('runAccessGate', () => {
  test('public: no gate', async () => {
    const ctx = ctxFor('pub');
    const res = await runAccessGate(ctx, {
      meta: { slug: 'pub', visibility_scope: 'public' }
    });
    expect(res).toBeNull();
  });

  test('unlisted: no gate', async () => {
    const ctx = ctxFor('ul');
    const res = await runAccessGate(ctx, {
      meta: { slug: 'ul', visibility_scope: 'unlisted' }
    });
    expect(res).toBeNull();
  });

  test('private without cookie → 401', async () => {
    const ctx = ctxFor('priv');
    const res = await runAccessGate(ctx, {
      meta: { slug: 'priv', visibility_scope: 'private' }
    });
    expect(res?.status).toBe(401);
  });

  test('private with valid cookie → null (allow)', async () => {
    const token = await signInviteGrant(
      {
        sub: 'anon-1',
        app: 'priv',
        tok: 't',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      SECRET
    );
    const cookieName = inviteCookieName('priv', { secure: false });
    const ctx = ctxFor('priv', `${cookieName}=${token}`);
    const res = await runAccessGate(ctx, {
      meta: { slug: 'priv', visibility_scope: 'private' }
    });
    expect(res).toBeNull();
  });

  test('private with cookie for different slug → 401', async () => {
    const token = await signInviteGrant(
      {
        sub: 'anon-1',
        app: 'other',
        tok: 't',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      SECRET
    );
    const cookieName = inviteCookieName('priv', { secure: false });
    const ctx = ctxFor('priv', `${cookieName}=${token}`);
    const res = await runAccessGate(ctx, {
      meta: { slug: 'priv', visibility_scope: 'private' }
    });
    expect(res?.status).toBe(401);
  });

  test('skips gate for /__shippie/* even when private', async () => {
    const ctx = {
      request: new Request('http://priv.localhost/__shippie/manifest'),
      env: envWith(SECRET),
      slug: 'priv',
      traceId: 't'
    };
    const res = await runAccessGate(ctx, {
      meta: { slug: 'priv', visibility_scope: 'private' }
    });
    expect(res).toBeNull();
  });
});
