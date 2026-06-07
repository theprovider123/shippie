/**
 * Microsoft 365 / Entra ID OAuth — Arctic sibling of google.ts.
 *
 * Schools commonly run Microsoft 365 (Entra ID, formerly Azure AD). This is
 * the SSO sibling to Google for the Uniti school-domain login.
 *
 * NOT YET WIRED to live creds in this environment — the login page omits the
 * Microsoft button until MICROSOFT_CLIENT_ID/SECRET are set, and the callback
 * 501s. Everything is gated behind env-present checks so the app never crashes
 * when creds are absent (magic-link remains the testable default).
 *
 * To enable: register an app at https://entra.microsoft.com → set
 *   wrangler secret put MICROSOFT_CLIENT_ID
 *   wrangler secret put MICROSOFT_CLIENT_SECRET
 *   (optional) MICROSOFT_TENANT — defaults to 'common' (any work/school account)
 * Redirect URI: PUBLIC_ORIGIN + /auth/callback/microsoft.
 */
import { MicrosoftEntraId } from 'arctic';

export interface MicrosoftEnv {
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT?: string;
  PUBLIC_ORIGIN?: string;
}

export class MicrosoftNotConfiguredError extends Error {
  constructor() {
    super(
      'Microsoft OAuth is not configured in this environment. See lib/server/auth/microsoft.ts for the TODO.',
    );
    this.name = 'MicrosoftNotConfiguredError';
  }
}

export function createMicrosoft(env: MicrosoftEnv): MicrosoftEntraId {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new MicrosoftNotConfiguredError();
  }
  const origin = env.PUBLIC_ORIGIN ?? 'https://shippie.app';
  const redirectURI = `${origin.replace(/\/$/, '')}/auth/callback/microsoft`;
  // 'common' = any Microsoft work/school/personal account; schools can pin
  // their own tenant id via MICROSOFT_TENANT for single-org sign-in.
  const tenant = env.MICROSOFT_TENANT?.trim() || 'common';
  return new MicrosoftEntraId(
    tenant,
    env.MICROSOFT_CLIENT_ID,
    env.MICROSOFT_CLIENT_SECRET,
    redirectURI,
  );
}

export function isMicrosoftConfigured(env: MicrosoftEnv): boolean {
  return Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
}

export interface MicrosoftProfile {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
}

/** Fetch the signed-in user's profile from Microsoft Graph. */
export async function fetchMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph /me returned ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    id: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  return {
    id: body.id,
    displayName: body.displayName ?? null,
    mail: body.mail ?? null,
    userPrincipalName: body.userPrincipalName ?? null,
  };
}
