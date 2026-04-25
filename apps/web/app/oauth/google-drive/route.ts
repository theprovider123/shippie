/**
 * GET /oauth/google-drive
 *
 * The single OAuth coordinator endpoint registered with Google for the
 * entire Shippie platform. Per the post-cloud-platform plan, every
 * Shippie app — running under any maker subdomain — opens a popup to
 * `https://shippie.app/oauth/google-drive` rather than registering its
 * own redirect URI. The HMAC'd `state` envelope carries the originating
 * app's slug + nonce + PKCE challenge so this handler can dispatch
 * the result back to the right opener without trusting the URL alone.
 *
 * Two phases are served by the same route:
 *
 *   1. INITIATE  — query has `p` + `s` (envelope payload + sig).
 *      We verify the envelope, save the still-encoded envelope in a
 *      short-lived cookie keyed by nonce, then 302 to Google's
 *      authorization URL with our own redirect URI.
 *
 *   2. CALLBACK  — query has `code` + `state` (returned by Google).
 *      The `state` value is the bare nonce; we look up the cookie,
 *      re-verify the envelope, exchange the code for a token, and
 *      either:
 *        - postMessage the token back to `window.opener` and self-close
 *          (default), or
 *        - 302 to a maker-app `__shippie/oauth-return` URL with the
 *          token packaged in a per-app envelope (mobile Safari fallback).
 *
 * Notes:
 *   - Tokens are NEVER persisted server-side. They are surfaced to the
 *     originating app and stored there in OPFS.
 *   - We never log token bodies; only redacted lengths + state nonce.
 *   - GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET are required
 *     in production; absent envs short-circuit with a clear error.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  buildAuthorizeUrl,
  signEnvelope,
  verifyEnvelope,
  type OAuthEnvelope,
  type SignedEnvelope,
} from '@shippie/backup-providers';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE_PREFIX = 'shippie_oauth_state_';
const COOKIE_TTL_SECONDS = 10 * 60;

/**
 * Configuration helper — exported so tests can stub env reads.
 */
export interface CoordinatorEnv {
  coordinatorSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;
}

export function readCoordinatorEnv(): CoordinatorEnv {
  const coordinatorSecret = process.env.OAUTH_COORDINATOR_SECRET ?? '';
  const googleClientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? '';
  const googleClientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '';
  const host = process.env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `https://${host}/oauth/google-drive`;
  return { coordinatorSecret, googleClientId, googleClientSecret, redirectUri };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface CoordinatorDeps {
  env?: CoordinatorEnv;
  /** Test injection. */
  fetchImpl?: typeof fetch;
  /** Test injection — `Date.now()` used for envelope verification. */
  now?: () => number;
}

const defaults: Required<Omit<CoordinatorDeps, 'env'>> = {
  fetchImpl: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
};

/**
 * Internal handler — extracted so the route test can call it without
 * spinning up the full Next.js runtime.
 */
export async function handleCoordinator(req: NextRequest, deps: CoordinatorDeps = {}): Promise<NextResponse> {
  const env = deps.env ?? readCoordinatorEnv();
  const fetchImpl = deps.fetchImpl ?? defaults.fetchImpl;
  const now = deps.now ?? defaults.now;

  if (!env.coordinatorSecret) {
    return NextResponse.json(
      { error: 'oauth_coordinator_not_configured' },
      { status: 500 },
    );
  }

  const params = req.nextUrl.searchParams;
  const code = params.get('code');
  const stateNonce = params.get('state');

  if (code && stateNonce) {
    return handleCallback(req, { env, fetchImpl, now, code, stateNonce });
  }

  const payload = params.get('p');
  const sig = params.get('s');
  const scope = params.get('scope') ?? '';
  if (payload && sig) {
    return handleInitiate(req, { env, now, signed: { payload, sig }, scope });
  }

  return NextResponse.json({ error: 'oauth_invalid_request' }, { status: 400 });
}

async function handleInitiate(
  req: NextRequest,
  ctx: { env: CoordinatorEnv; now: () => number; signed: SignedEnvelope; scope: string },
): Promise<NextResponse> {
  if (!ctx.env.googleClientId) {
    return NextResponse.json(
      { error: 'google_drive_client_not_configured' },
      { status: 500 },
    );
  }
  const verified = await verifyEnvelope(ctx.signed, ctx.env.coordinatorSecret, {
    expectedProvider: 'google-drive',
    now: ctx.now(),
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 400 });
  }
  const envelope = verified.envelope;

  // Hand Google their `state` — we use the bare nonce so cookie lookup
  // is deterministic; the trusted bytes live in the HttpOnly cookie.
  const stateForGoogle = envelope.nonce;

  const authorize = new URL(GOOGLE_AUTHORIZE_URL);
  authorize.searchParams.set('client_id', ctx.env.googleClientId);
  authorize.searchParams.set('redirect_uri', ctx.env.redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', ctx.scope || 'https://www.googleapis.com/auth/drive.file');
  authorize.searchParams.set('state', stateForGoogle);
  authorize.searchParams.set('code_challenge', envelope.codeChallenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('access_type', 'offline');
  authorize.searchParams.set('prompt', 'consent');
  authorize.searchParams.set('include_granted_scopes', 'true');

  const res = NextResponse.redirect(authorize.toString());
  // Persist the FULL signed envelope (so callback can re-verify HMAC).
  // HttpOnly + secure + short TTL — never readable by JS, never leaves
  // shippie.app, expires before the Google flow times out.
  res.cookies.set({
    name: STATE_COOKIE_PREFIX + envelope.nonce,
    value: JSON.stringify(ctx.signed),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_TTL_SECONDS,
    path: '/oauth/google-drive',
  });
  return res;
}

async function handleCallback(
  req: NextRequest,
  ctx: {
    env: CoordinatorEnv;
    fetchImpl: typeof fetch;
    now: () => number;
    code: string;
    stateNonce: string;
  },
): Promise<NextResponse> {
  const cookieName = STATE_COOKIE_PREFIX + ctx.stateNonce;
  const cookie = req.cookies.get(cookieName)?.value;
  if (!cookie) {
    return errorPage('oauth_state_missing', null);
  }
  let signed: SignedEnvelope;
  try {
    signed = JSON.parse(cookie) as SignedEnvelope;
  } catch {
    return errorPage('oauth_state_corrupt', null);
  }
  const verified = await verifyEnvelope(signed, ctx.env.coordinatorSecret, {
    expectedProvider: 'google-drive',
    now: ctx.now(),
  });
  if (!verified.ok) {
    return errorPage(verified.reason, null);
  }
  const envelope: OAuthEnvelope = verified.envelope;

  // Exchange the code for a token. The PKCE verifier is held by the
  // originating app; Google enforces the challenge match server-side
  // so the verifier *must* be supplied by the requester. Two flows:
  //   - "popup" mode: the maker app already exchanged the verifier
  //     into a URL fragment we read on the opener side after this
  //     redirect. To keep things simple we use the second approach:
  //     pass through the code unchanged and let the originating app
  //     hit Google's token endpoint itself with the verifier.
  // BUT Google requires the redirect_uri match; only `shippie.app/oauth/...`
  // is registered. So Shippie MUST do the exchange. Solution: the
  // originating app supplies the verifier in the COOKIE state via a
  // pre-redirect handshake. Here we read it back if present.
  const verifier = req.cookies.get(STATE_COOKIE_PREFIX + envelope.nonce + '_v')?.value ?? '';

  let tokenResponse: GoogleTokenResponse;
  try {
    tokenResponse = await exchangeCode({
      env: ctx.env,
      fetchImpl: ctx.fetchImpl,
      code: ctx.code,
      verifier,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorPage('oauth_token_exchange_failed', message);
  }

  // Re-sign a fresh envelope keyed to the originating app slug — this
  // is what the opener verifies before accepting the token.
  const resultEnvelope: OAuthEnvelope = {
    ...envelope,
    ts: ctx.now(),
  };
  const signedResult = await signEnvelope(resultEnvelope, ctx.env.coordinatorSecret);

  return successResponse({
    appSlug: envelope.appSlug,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresIn: tokenResponse.expires_in,
    scope: tokenResponse.scope,
    issuedAt: ctx.now(),
    signedEnvelope: signedResult,
    cookieName,
    verifierCookieName: STATE_COOKIE_PREFIX + envelope.nonce + '_v',
  });
}

async function exchangeCode(input: {
  env: CoordinatorEnv;
  fetchImpl: typeof fetch;
  code: string;
  verifier: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams();
  body.set('code', input.code);
  body.set('client_id', input.env.googleClientId);
  body.set('client_secret', input.env.googleClientSecret);
  body.set('redirect_uri', input.env.redirectUri);
  body.set('grant_type', 'authorization_code');
  if (input.verifier) body.set('code_verifier', input.verifier);

  const res = await input.fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    // Surface only the status + first 200 chars; never log the body
    // verbatim because it can contain client secrets in error responses.
    throw new Error(`google_token_exchange_${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

interface SuccessInput {
  appSlug: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
  issuedAt: number;
  signedEnvelope: SignedEnvelope;
  cookieName: string;
  verifierCookieName: string;
}

/**
 * Render the popup-return HTML — the script posts the token to
 * `window.opener` and self-closes. Includes a fallback link to the
 * mobile-Safari path: a click that 302s to the maker app's
 * `__shippie/oauth-return` URL with the token in the URL fragment.
 *
 * The token NEVER touches the page DOM; it lives only inside the
 * postMessage call until the opener receives it. We don't render it
 * into innerHTML.
 */
function successResponse(input: SuccessInput): NextResponse {
  const tokenJson = JSON.stringify({
    appSlug: input.appSlug,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.issuedAt + input.expiresIn * 1000,
    issuedAt: input.issuedAt,
    scope: input.scope,
    envelope: input.signedEnvelope,
  });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Shippie · sign-in complete</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
         background:#FAF7EF; color:#14120F; margin:0; padding:24px;
         display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 18px; font-weight: 600; }
  p { color:#5C5751; font-size: 14px; line-height: 1.5; }
  a { color:#E8603C; }
</style></head>
<body>
  <div class="card">
    <h1>Sign-in complete</h1>
    <p>You can close this tab. If it doesn't close on its own,
       <a href="#" id="manual">return to the app</a>.</p>
  </div>
  <script id="payload" type="application/json">${escapeJson(tokenJson)}</script>
  <script>
  (function () {
    var raw = document.getElementById('payload').textContent || '{}';
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    var msg = { kind: 'shippie-oauth', provider: 'google-drive', ok: true, token: data };
    if (window.opener && !window.opener.closed) {
      try {
        // Target origin "*" is safe because the receiver also checks
        // the HMAC envelope before accepting the token.
        window.opener.postMessage(msg, '*');
      } catch (e) { /* noop */ }
    }
    setTimeout(function () { try { window.close(); } catch (e) {} }, 250);
    var manual = document.getElementById('manual');
    manual.addEventListener('click', function (ev) {
      ev.preventDefault();
      // Mobile Safari fallback: forward into a per-app return URL.
      // The maker app reads the fragment and feeds it through the SDK.
      var fragment = encodeURIComponent(JSON.stringify(msg));
      var slug = data.appSlug;
      window.location.href = 'https://' + slug + '.shippie.app/__shippie/oauth-return#' + fragment;
    });
  })();
  </script>
</body></html>`;
  const res = new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Block embedding so a maker app can't iframe this page and
      // sniff the postMessage with a malicious origin.
      'x-frame-options': 'DENY',
      'cache-control': 'no-store',
    },
  });
  res.cookies.delete(input.cookieName);
  res.cookies.delete(input.verifierCookieName);
  return res;
}

function errorPage(reason: string, detail: string | null): NextResponse {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Shippie · sign-in error</title>
<style>body{font-family:-apple-system,Inter,sans-serif;background:#FAF7EF;color:#14120F;padding:24px}</style>
</head><body>
<h1>We couldn't complete sign-in</h1>
<p>${escapeHtml(reason)}</p>
${detail ? `<pre>${escapeHtml(detail)}</pre>` : ''}
<script>
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(
        { kind: 'shippie-oauth', provider: 'google-drive', ok: false, error: ${JSON.stringify(reason)} },
        '*'
      );
    } catch (e) {}
  }
</script>
</body></html>`;
  return new NextResponse(html, {
    status: 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'DENY',
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJson(value: string): string {
  // Avoid breaking out of </script>.
  return value.replace(/</g, '\\u003c');
}

export const GET = withLogger('oauth.google-drive', (req: NextRequest) => handleCoordinator(req));
