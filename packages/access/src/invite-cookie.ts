/**
 * HMAC-signed invite grant cookie. Used by both the control plane
 * (marketplace page gate + claim endpoint) and the worker (runtime access
 * gate). Single source of truth — both import from this package.
 *
 * Prod cookie name: `__Secure-shippie_invite_{slug}` (requires Secure; the
 * prefix makes it un-forgeable). Dev runs over http://*.localhost where
 * browsers SILENTLY DISCARD __Secure- cookies, so we fall back to a plain
 * name. Callers pass `{secure: isProduction}` to pick the right name.
 */
import { SignJWT, jwtVerify } from 'jose';

export interface InviteGrant {
  sub: string; // anonymous id or userId
  app: string; // app slug
  tok: string; // invite id (for revocation audit)
  src: 'invite_link' | 'invite_email';
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signInviteGrant(
  grant: InviteGrant & { exp: number },
  secret: string,
): Promise<string> {
  const { exp, ...body } = grant;
  return await new SignJWT({ ...body })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(secretKey(secret));
}

export async function verifyInviteGrant(
  token: string,
  secret: string,
): Promise<(InviteGrant & { exp: number }) | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    if (typeof payload.app !== 'string' || typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      app: payload.app,
      tok: String(payload.tok ?? ''),
      src: payload.src === 'invite_email' ? 'invite_email' : 'invite_link',
      exp: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

export interface CookieNameOpts {
  secure: boolean; // true in production (https), false in dev (http://*.localhost)
}

export function inviteCookieName(slug: string, opts: CookieNameOpts): string {
  return opts.secure ? `__Secure-shippie_invite_${slug}` : `shippie_invite_${slug}`;
}
