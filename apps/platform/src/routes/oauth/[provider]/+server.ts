/**
 * OAuth coordinator — Bring-Your-Own-Cloud backup edition.
 *
 * This is NOT user authentication for shippie.app itself — that's `/auth/*`.
 * This route brokers a maker app (e.g., recipe.shippie.app) authorising
 * its OWN access to the END USER'S cloud storage (e.g., the user's Google
 * Drive). Shippie holds the OAuth client_secret on this side; the
 * resulting token is passed back to the maker app via postMessage and
 * stored in the user's device-local OPFS — never on a Shippie server.
 *
 * Flow:
 *   1. Maker app generates a signed envelope (HMAC over the provider
 *      registration + appSlug + nonce + ts + codeChallenge) using the
 *      OAuth coordinator helpers in `@shippie/backup-providers`.
 *      It opens a popup to:
 *        https://shippie.app/oauth/google-drive?p=<payload>&s=<sig>&scope=<scopes>
 *
 *   2. THIS HANDLER (initial GET, popup) — verifies the envelope and
 *      302-redirects to the provider's authorize URL with `state` set
 *      to the same `<p>:<s>` so the callback can reverify without a
 *      cookie. The provider's redirect_uri is registered as
 *      `https://shippie.app/oauth/<provider>` — one redirect for the
 *      whole platform.
 *
 *   3. THIS HANDLER (callback GET with `code` + `state`) — re-verifies
 *      the state envelope, exchanges `code` (+ `client_secret`) at the
 *      provider's token endpoint, and returns a tiny self-closing HTML
 *      page that postMessage()s the token to `window.opener` with
 *      `targetOrigin = https://${envelope.appSlug}.shippie.app`. Token
 *      never persists on this server.
 *
 * Hard rules:
 *   - Only `google-drive` is a recognised provider in v1 (`BackupProviderId`).
 *   - The state envelope is the only auth — no cookies. Stateless coordinator.
 *   - The opener postMessage targetOrigin is derived from the SIGNED appSlug,
 *     never from a query parameter — that prevents a malicious popup-opener
 *     from receiving someone else's token.
 *   - Tokens are never logged, never stored on Shippie, never echoed back
 *     in any URL. The HTML response builds the token blob inline and sends
 *     it once via postMessage; the page closes itself.
 */
import { error as kitError } from '@sveltejs/kit';
import {
  verifyEnvelope,
  type SignedEnvelope,
  type OAuthEnvelope,
} from '@shippie/backup-providers';
import { GOOGLE_DRIVE_SCOPES } from '@shippie/backup-providers';
import type { BackupProviderId } from '@shippie/backup-providers';
import type { RequestHandler } from './$types';

type ProviderConfig = {
  id: BackupProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  /** Some providers want extra params on authorize (e.g., access_type=offline). */
  extraAuthorizeParams?: Record<string, string>;
};

const PROVIDERS: Record<string, ProviderConfig> = {
  'google-drive': {
    id: 'google-drive',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: GOOGLE_DRIVE_SCOPES,
    extraAuthorizeParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  },
};

interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

function readProviderCredentials(
  providerId: BackupProviderId,
  env: Env,
): ProviderCredentials | null {
  if (providerId === 'google-drive') {
    const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }
  return null;
}

function readCoordinatorSecret(env: Env): string | null {
  return env.OAUTH_COORDINATOR_SECRET ?? null;
}

function readPublicHost(env: Env): string {
  return env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';
}

interface Env {
  OAUTH_COORDINATOR_SECRET?: string;
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  SHIPPIE_PUBLIC_HOST?: string;
}

export const GET: RequestHandler = async ({ params, url, platform }) => {
  const provider = PROVIDERS[params.provider ?? ''];
  if (!provider) {
    throw kitError(404, `Unknown OAuth provider: ${params.provider}`);
  }

  const env = (platform?.env ?? {}) as Env;
  const secret = readCoordinatorSecret(env);
  if (!secret) {
    throw kitError(503, 'OAUTH_COORDINATOR_SECRET not configured.');
  }
  const credentials = readProviderCredentials(provider.id, env);
  if (!credentials) {
    throw kitError(503, `Provider credentials missing for ${provider.id}.`);
  }

  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const isCallback = code !== null && stateRaw !== null;

  if (isCallback) {
    return handleCallback({
      provider,
      url,
      code: code!,
      stateRaw: stateRaw!,
      secret,
      credentials,
      publicHost: readPublicHost(env),
    });
  }

  return handleInitial({
    provider,
    url,
    secret,
    credentials,
    publicHost: readPublicHost(env),
  });
};

/**
 * Initial popup landing — verify the envelope, redirect to the provider's
 * authorize URL with our coordinator's redirect_uri.
 */
async function handleInitial(input: {
  provider: ProviderConfig;
  url: URL;
  secret: string;
  credentials: ProviderCredentials;
  publicHost: string;
}): Promise<Response> {
  const payload = input.url.searchParams.get('p');
  const sig = input.url.searchParams.get('s');
  const scopeOverride = input.url.searchParams.get('scope');

  if (!payload || !sig) {
    throw kitError(400, 'Missing OAuth state envelope (p / s).');
  }

  const verifyResult = await verifyEnvelope(
    { payload, sig } satisfies SignedEnvelope,
    input.secret,
    { expectedProvider: input.provider.id },
  );
  if (!verifyResult.ok) {
    throw kitError(400, `OAuth state invalid: ${verifyResult.reason}`);
  }

  const scopes =
    scopeOverride && scopeOverride.length > 0
      ? scopeOverride.split(/\s+/)
      : input.provider.defaultScopes;

  const redirectUri = `https://${input.publicHost}/oauth/${input.provider.id}`;
  const authorize = new URL(input.provider.authorizeUrl);
  authorize.searchParams.set('client_id', input.credentials.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', scopes.join(' '));
  // We round-trip the entire signed envelope through `state` so the
  // callback can re-verify without server-side session storage.
  authorize.searchParams.set('state', `${payload}:${sig}`);
  for (const [k, v] of Object.entries(input.provider.extraAuthorizeParams ?? {})) {
    authorize.searchParams.set(k, v);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: authorize.toString() },
  });
}

/**
 * Provider callback — verify state, exchange code for token, post the
 * token back to the maker app via window.opener.
 */
async function handleCallback(input: {
  provider: ProviderConfig;
  url: URL;
  code: string;
  stateRaw: string;
  secret: string;
  credentials: ProviderCredentials;
  publicHost: string;
}): Promise<Response> {
  const stateParts = input.stateRaw.split(':');
  if (stateParts.length !== 2 || !stateParts[0] || !stateParts[1]) {
    return errorPage('Invalid state format.');
  }
  const signed: SignedEnvelope = { payload: stateParts[0]!, sig: stateParts[1]! };
  const verifyResult = await verifyEnvelope(signed, input.secret, {
    expectedProvider: input.provider.id,
  });
  if (!verifyResult.ok) {
    return errorPage(`State verification failed: ${verifyResult.reason}`);
  }
  const envelope = verifyResult.envelope;

  const redirectUri = `https://${input.publicHost}/oauth/${input.provider.id}`;
  let tokenJson: ProviderTokenResponse;
  try {
    tokenJson = await exchangeCodeForToken({
      tokenUrl: input.provider.tokenUrl,
      code: input.code,
      clientId: input.credentials.clientId,
      clientSecret: input.credentials.clientSecret,
      redirectUri,
    });
  } catch (err) {
    return errorPage(
      `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return postTokenToOpener(envelope, tokenJson);
}

interface ProviderTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function exchangeCodeForToken(input: {
  tokenUrl: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<ProviderTokenResponse> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(input.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Provider returned ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as ProviderTokenResponse;
  if (!json.access_token) {
    throw new Error('Provider did not return access_token.');
  }
  return json;
}

/**
 * Build a tiny self-closing HTML page that posts the token to
 * window.opener and then closes itself. The targetOrigin is the SIGNED
 * appSlug from the verified envelope — never a value from the URL or
 * the provider response.
 */
function postTokenToOpener(
  envelope: OAuthEnvelope,
  token: ProviderTokenResponse,
): Response {
  const issuedAt = Date.now();
  const expiresIn = token.expires_in ?? 3600;
  const tokenForMaker = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: issuedAt + expiresIn * 1000,
    scope: token.scope ?? '',
    issuedAt,
  };

  const targetOrigin = `https://${envelope.appSlug}.shippie.app`;
  // Shape mirrors what `packages/sdk/src/wrapper/your-data-panel.ts →
  // defaultConfigureBackup` listens for:
  //   { kind: 'shippie-oauth', provider, ok, token }
  // We also include `nonce` so the maker can match against any
  // outstanding popup it opened (defence against stale messages).
  const messagePayload = {
    kind: 'shippie-oauth',
    provider: envelope.provider,
    nonce: envelope.nonce,
    ok: true,
    token: tokenForMaker,
  };

  // The token is interpolated into a JSON.parse() arg inside the page —
  // we go through JSON.stringify TWICE so the inner JSON survives intact
  // even if it contains characters that would otherwise break the
  // surrounding script literal.
  const inlineJson = JSON.stringify(JSON.stringify(messagePayload));
  const safeTargetOrigin = JSON.stringify(targetOrigin);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shippie OAuth</title></head><body><p>Authorisation complete. You can close this window.</p><script>(function(){try{var p=JSON.parse(${inlineJson});if(window.opener){window.opener.postMessage(p,${safeTargetOrigin});}}catch(e){console.error(e);}finally{setTimeout(function(){window.close();},80);}})();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // No-store: token is in the response body once and must never be cached
      // by an intermediary or the browser's back/forward cache.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      // Defense-in-depth: deny embedding so a hostile site can't iframe this.
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      Pragma: 'no-cache',
    },
  });
}

function errorPage(message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>OAuth Error</title></head><body><h1>OAuth error</h1><p>${escapeHtml(message)}</p><p>You can close this window.</p></body></html>`;
  return new Response(html, {
    status: 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
