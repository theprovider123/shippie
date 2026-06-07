/**
 * Google OAuth — Arctic stub.
 *
 * Optional provider. The login page omits the Google button until
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 *
 * Enablement checklist:
 *   register an OAuth client at https://console.cloud.google.com/
 *   wrangler secret put GOOGLE_CLIENT_ID
 *   wrangler secret put GOOGLE_CLIENT_SECRET
 */
import { Google } from 'arctic';

export interface GoogleEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PUBLIC_ORIGIN?: string;
}

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('Google OAuth is not configured in this environment.');
    this.name = 'GoogleNotConfiguredError';
  }
}

export function createGoogle(env: GoogleEnv): Google {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleNotConfiguredError();
  }
  const origin = env.PUBLIC_ORIGIN ?? 'https://shippie.app';
  const redirectURI = `${origin.replace(/\/$/, '')}/auth/callback/google`;
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectURI);
}

export function isGoogleConfigured(env: GoogleEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export interface GoogleProfile {
  sub: string;
  email: string | null;
  email_verified: boolean;
  name: string | null;
  picture: string | null;
}

/** Fetch the OpenID userinfo after exchanging a code for a token. */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo returned ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: body.sub,
    email: body.email ?? null,
    email_verified: Boolean(body.email_verified),
    name: body.name ?? null,
    picture: body.picture ?? null,
  };
}
