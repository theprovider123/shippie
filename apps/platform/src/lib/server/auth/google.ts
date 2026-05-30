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
