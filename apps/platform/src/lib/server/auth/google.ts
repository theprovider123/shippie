/**
 * Google OAuth — Arctic stub.
 *
 * NOT YET WIRED. The user has not provisioned a Google OAuth client; this
 * module exists so future enablement is a one-route addition. The login
 * page omits the Google button until GOOGLE_CLIENT_ID is set.
 *
 * TODO: register OAuth client at https://console.cloud.google.com/, set:
 *   wrangler secret put GOOGLE_CLIENT_ID
 *   wrangler secret put GOOGLE_CLIENT_SECRET
 * then uncomment the Google branch in routes/auth/login/+page.svelte +
 * routes/auth/callback/[provider]/+server.ts.
 */
import { Google } from 'arctic';

export interface GoogleEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PUBLIC_ORIGIN?: string;
}

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('Google OAuth is not configured in this environment. See lib/server/auth/google.ts for the TODO.');
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
