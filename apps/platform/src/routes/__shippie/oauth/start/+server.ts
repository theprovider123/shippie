/**
 * `GET /__shippie/oauth/start`
 *
 * Maker apps don't (and shouldn't) hold the `OAUTH_COORDINATOR_SECRET`.
 * This route is the server-side entry point that mints + signs the
 * envelope on a maker's behalf, then 302-redirects to
 * `/oauth/<provider>` (which is the OAuth coordinator the SDK panel
 * already targets — see `packages/sdk/src/wrapper/your-data-panel.ts
 * → defaultConfigureBackup`).
 *
 * Inputs:
 *   ?provider=google-drive
 *   ?app=<maker app slug>
 *   ?v=<PKCE code_challenge>   (the maker keeps the verifier)
 *
 * Output: 302 to `/oauth/<provider>?p=<payload>&s=<sig>&scope=...`.
 *
 * Note: this endpoint trusts the `app` parameter for slug attribution.
 * The downstream OAuth coordinator postMessage uses the SIGNED appSlug
 * to compute the postMessage targetOrigin, so a forged `app` query
 * would result in a token only ever delivered to that slug's origin —
 * the worst-case is "an attacker tricks the user into installing a
 * different app's backup token to a different app," which the consent
 * screen would also surface. v1 documents this; v1.5 adds a Referer
 * cross-check to harden it.
 */
import { redirect, error as kitError } from '@sveltejs/kit';
import {
  signEnvelope,
  GOOGLE_DRIVE_SCOPES,
  type BackupProviderId,
  type OAuthEnvelope,
} from '@shippie/backup-providers';
import type { RequestHandler } from './$types';

const PROVIDER_DEFAULT_SCOPES: Record<BackupProviderId, string[]> = {
  'google-drive': GOOGLE_DRIVE_SCOPES,
};

interface Env {
  OAUTH_COORDINATOR_SECRET?: string;
  SHIPPIE_PUBLIC_HOST?: string;
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const provider = url.searchParams.get('provider');
  if (provider !== 'google-drive') {
    throw kitError(400, 'unsupported provider');
  }
  const appSlug = url.searchParams.get('app');
  if (!appSlug || !/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(appSlug)) {
    throw kitError(400, 'invalid app slug');
  }
  const codeChallenge = url.searchParams.get('v') ?? '';

  const env = (platform?.env ?? {}) as Env;
  const secret = env.OAUTH_COORDINATOR_SECRET;
  if (!secret) {
    throw kitError(503, 'OAUTH_COORDINATOR_SECRET not configured');
  }
  const publicHost = env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';

  const envelope: OAuthEnvelope = {
    appSlug,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
    provider,
    codeChallenge,
  };
  const signed = await signEnvelope(envelope, secret);

  const target = new URL(`https://${publicHost}/oauth/${provider}`);
  target.searchParams.set('p', signed.payload);
  target.searchParams.set('s', signed.sig);
  target.searchParams.set('scope', PROVIDER_DEFAULT_SCOPES[provider].join(' '));

  throw redirect(302, target.toString());
};
