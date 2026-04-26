/**
 * Lucia v3 factory for the Shippie platform.
 *
 * The Worker request lifecycle gives us a fresh D1Database binding per request,
 * so we instantiate Lucia per-request. (Lucia is cheap to construct — it just
 * holds an adapter reference + a couple of small config objects.)
 *
 * Cookie domain:
 *   - production: `.shippie.app` so `*.shippie.app` maker subdomains see the
 *     session cookie. The wrapper rewriter (Phase 5) reads this to decide
 *     whether the visitor is signed in.
 *   - canary: `.shippie.app` (same — `next.shippie.app` is a subdomain too).
 *   - dev / unknown: undefined → defaults to current host (works on localhost).
 *
 * SHIPPIE_ENV values come from wrangler.toml `[vars]` (`canary` today,
 * `production` after cutover) and from `.dev.vars` for `wrangler dev`.
 */
import { Lucia, TimeSpan } from 'lucia';
import { D1Adapter } from '@lucia-auth/adapter-sqlite';
import type { D1Database } from '@cloudflare/workers-types';

export interface DatabaseUserAttributes {
  username: string | null;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: number; // SQLite stores booleans as 0/1
}

/**
 * The shape `event.locals.user` exposes to route loaders. `id` is added by
 * Lucia from the `users` row PK; the rest comes from `getUserAttributes`.
 */
export interface AppUser {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface UserAttributes {
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

const SESSION_TTL_DAYS = 30;

function cookieDomain(env: { SHIPPIE_ENV?: string }): string | undefined {
  const flavor = env.SHIPPIE_ENV ?? 'development';
  if (flavor === 'production' || flavor === 'canary') return '.shippie.app';
  return undefined; // dev / localhost — let the browser set host-only cookie
}

export function createLucia(db: D1Database, env: { SHIPPIE_ENV?: string } = {}) {
  // `db as any` because workers-types' D1Database has slightly different
  // generics than the one Lucia's adapter consumes; identical at runtime.
  const adapter = new D1Adapter(db as never, {
    user: 'users',
    session: 'sessions',
  });

  const isSecure = env.SHIPPIE_ENV === 'production' || env.SHIPPIE_ENV === 'canary';

  return new Lucia(adapter, {
    sessionExpiresIn: new TimeSpan(SESSION_TTL_DAYS, 'd'),
    sessionCookie: {
      name: 'shippie_session',
      expires: false, // long-lived; Lucia rotates server-side
      attributes: {
        secure: isSecure,
        sameSite: 'lax',
        domain: cookieDomain(env),
        path: '/',
      },
    },
    getUserAttributes: (attrs: DatabaseUserAttributes): UserAttributes => ({
      email: attrs.email,
      username: attrs.username,
      displayName: attrs.display_name,
      avatarUrl: attrs.avatar_url,
      isAdmin: Boolean(attrs.is_admin),
    }),
  });
}

export type AppLucia = ReturnType<typeof createLucia>;

/**
 * Module augmentation so Lucia's `Session` and `User` types pick up our
 * attribute shape across the whole app.
 */
declare module 'lucia' {
  interface Register {
    Lucia: AppLucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}
