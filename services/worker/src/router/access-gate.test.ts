import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { accessGate } from './access-gate.ts';
import type { AppBindings } from '../app.ts';
import { signInviteGrant, inviteCookieName } from '@shippie/access/invite-cookie';

const SECRET = 'test-secret-32bytes-aaaaaaaaaaaaaaaa';

function buildApp(visibility: 'public' | 'unlisted' | 'private', slug: string) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('slug', slug);
    c.set('traceId', 'test');
    await next();
  });
  app.use(
    '*',
    accessGate({
      loadMeta: async () => ({ visibility_scope: visibility, slug }),
    }),
  );
  app.get('*', (c) => c.text('ok'));
  // @ts-expect-error — test harness provides a minimal env
  app.fetch.env = { INVITE_SECRET: SECRET };
  return app;
}

async function fetchWith(app: ReturnType<typeof buildApp>, path: string, cookie?: string) {
  const req = new Request(`http://slug.localhost${path}`, {
    headers: cookie ? { cookie } : {},
  });
  return app.fetch(req, { INVITE_SECRET: SECRET } as never);
}

describe('accessGate', () => {
  test('public: serves without cookie', async () => {
    const app = buildApp('public', 'pub');
    const res = await fetchWith(app, '/');
    expect(res.status).toBe(200);
  });

  test('unlisted: serves without cookie', async () => {
    const app = buildApp('unlisted', 'ul');
    const res = await fetchWith(app, '/');
    expect(res.status).toBe(200);
  });

  test('private: returns 401 without cookie', async () => {
    const app = buildApp('private', 'priv');
    const res = await fetchWith(app, '/');
    expect(res.status).toBe(401);
  });

  test('private: serves with valid invite cookie', async () => {
    const token = await signInviteGrant(
      {
        sub: 'anon-1',
        app: 'priv',
        tok: 't',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      SECRET,
    );
    const cookieName = inviteCookieName('priv', { secure: false });
    const app = buildApp('private', 'priv');
    const res = await fetchWith(app, '/', `${cookieName}=${token}`);
    expect(res.status).toBe(200);
  });

  test('private: 401 when cookie is for a different slug', async () => {
    const token = await signInviteGrant(
      {
        sub: 'anon-1',
        app: 'other-slug',
        tok: 't',
        src: 'invite_link',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      SECRET,
    );
    const cookieName = inviteCookieName('priv', { secure: false });
    const app = buildApp('private', 'priv');
    const res = await fetchWith(app, '/', `${cookieName}=${token}`);
    expect(res.status).toBe(401);
  });

  test('private: skips the gate for /__shippie/* system routes', async () => {
    const app = buildApp('private', 'priv');
    const res = await fetchWith(app, '/__shippie/manifest');
    // No manifest handler registered here; we just need the gate to pass through.
    // Hono's default is 404 when no handler matches. What matters: NOT 401.
    expect(res.status).not.toBe(401);
  });
});
