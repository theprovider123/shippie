/**
 * __shippie/session
 * __shippie/auth/*
 *
 * Stubs for Week 4 (auth implementation). The real implementation will:
 *   - Read the __shippie_session cookie (opaque handle)
 *   - Forward to platform /api/internal/session/authorize with HMAC signing
 *   - Return { user, scope, expires_at } or 401
 *
 * Spec v6 §6 (auth architecture), §13.6 (verify kit callback).
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

export const sessionRouter = new Hono<AppBindings>();

sessionRouter.get('/', async (c) => {
  // Week 4: look up opaque handle via platform
  const cookie = c.req.header('cookie') ?? '';
  const sessionCookie = parseCookie(cookie, '__shippie_session');

  if (!sessionCookie) {
    return c.json({ user: null }, 401);
  }

  return c.json(
    {
      user: null,
      pending: true,
      message: 'Opaque handle session resolution lands in Week 4',
    },
    501,
  );
});

sessionRouter.delete('/', async (c) => {
  return c.json({ ok: true, message: 'sign-out stub' });
});

function parseCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(';').map((s) => s.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
