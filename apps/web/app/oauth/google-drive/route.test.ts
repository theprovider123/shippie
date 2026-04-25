/**
 * Tests for the OAuth coordinator route handler.
 *
 * We import the internal `handleCoordinator` (rather than the
 * `withLogger`-wrapped GET export) so the tests don't have to fake
 * the Next.js logger context. The handler takes a `NextRequest`
 * built directly from the Web Fetch API.
 */
import { describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import {
  signEnvelope,
  generateCodeVerifier,
  deriveCodeChallenge,
  type OAuthEnvelope,
} from '@shippie/backup-providers';
import { handleCoordinator, type CoordinatorEnv } from './route';

const env: CoordinatorEnv = {
  coordinatorSecret: 'test-secret-XX',
  googleClientId: 'fake-client.apps.googleusercontent.com',
  googleClientSecret: 'fake-secret',
  redirectUri: 'https://shippie.app/oauth/google-drive',
};

function makeRequest(url: string, init?: { cookies?: Record<string, string>; method?: string }): NextRequest {
  const headers = new Headers();
  if (init?.cookies) {
    const cookie = Object.entries(init.cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');
    headers.set('cookie', cookie);
  }
  return new NextRequest(url, { method: init?.method ?? 'GET', headers });
}

async function makeEnvelope(overrides: Partial<OAuthEnvelope> = {}) {
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const envelope: OAuthEnvelope = {
    appSlug: 'recipes',
    nonce: 'nonce-abc-1',
    ts: Date.now(),
    provider: 'google-drive',
    codeChallenge: challenge,
    ...overrides,
  };
  const signed = await signEnvelope(envelope, env.coordinatorSecret);
  return { envelope, signed, verifier };
}

describe('handleCoordinator INITIATE', () => {
  test('verifies envelope, redirects to Google, sets state cookie', async () => {
    const { envelope, signed } = await makeEnvelope();
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('p', signed.payload);
    url.searchParams.set('s', signed.sig);
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
    const req = makeRequest(url.toString());
    const res = await handleCoordinator(req, { env });
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true);
    expect(location).toContain('client_id=fake-client.apps.googleusercontent.com');
    expect(location).toContain('code_challenge_method=S256');
    expect(location).toContain(`code_challenge=${envelope.codeChallenge}`);
    expect(location).toContain(`state=${envelope.nonce}`);
    // Cookie set with the nonce key.
    const cookie = res.cookies.get(`shippie_oauth_state_${envelope.nonce}`);
    expect(cookie).toBeDefined();
    // Cookie value carries the signed envelope so callback can re-verify.
    const parsed = JSON.parse(cookie!.value) as { payload: string; sig: string };
    expect(parsed.payload).toBe(signed.payload);
    expect(parsed.sig).toBe(signed.sig);
  });

  test('rejects forged signature with 400', async () => {
    const { signed } = await makeEnvelope();
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('p', signed.payload);
    url.searchParams.set('s', signed.sig);
    const req = makeRequest(url.toString());
    const wrongEnv: CoordinatorEnv = { ...env, coordinatorSecret: 'WRONG' };
    const res = await handleCoordinator(req, { env: wrongEnv });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('state_signature_mismatch');
  });

  test('rejects expired envelope with 400', async () => {
    const { signed } = await makeEnvelope({ ts: Date.now() - 30 * 60 * 1000 });
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('p', signed.payload);
    url.searchParams.set('s', signed.sig);
    const req = makeRequest(url.toString());
    const res = await handleCoordinator(req, { env });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('state_expired');
  });

  test('returns 500 when OAUTH_COORDINATOR_SECRET unset', async () => {
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('p', 'x');
    url.searchParams.set('s', 'y');
    const req = makeRequest(url.toString());
    const res = await handleCoordinator(req, {
      env: { ...env, coordinatorSecret: '' },
    });
    expect(res.status).toBe(500);
  });

  test('returns 400 when neither envelope nor code provided', async () => {
    const req = makeRequest('https://shippie.app/oauth/google-drive');
    const res = await handleCoordinator(req, { env });
    expect(res.status).toBe(400);
  });
});

describe('handleCoordinator CALLBACK', () => {
  test('exchanges code for token, returns popup HTML, clears cookie', async () => {
    const { envelope, signed } = await makeEnvelope();
    let capturedTokenRequest: { url: string; body: string; headers: Record<string, string> } | null = null;
    const fetchImpl = (async (input: URL | string | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === 'string' ? init.body : '';
      const headers: Record<string, string> = {};
      const h = init?.headers ?? {};
      if (h instanceof Headers) {
        h.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });
      } else if (h && typeof h === 'object' && !Array.isArray(h)) {
        for (const k of Object.keys(h as object)) {
          headers[k.toLowerCase()] = String((h as Record<string, string>)[k]);
        }
      }
      capturedTokenRequest = { url, body, headers };
      return new Response(
        JSON.stringify({
          access_token: 'ya29.test-access',
          expires_in: 3600,
          refresh_token: 'rt-1',
          scope: 'https://www.googleapis.com/auth/drive.file',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('code', 'auth-code-XYZ');
    url.searchParams.set('state', envelope.nonce);
    const req = makeRequest(url.toString(), {
      cookies: {
        [`shippie_oauth_state_${envelope.nonce}`]: JSON.stringify(signed),
        [`shippie_oauth_state_${envelope.nonce}_v`]: 'verifier-test',
      },
    });
    const res = await handleCoordinator(req, { env, fetchImpl });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const html = await res.text();
    // Token must be embedded in the JSON payload script tag for postMessage.
    expect(html).toContain('ya29.test-access');
    expect(html).toContain('shippie-oauth');
    expect(html).toContain('window.opener');
    expect(html).toContain('window.close');

    // Token exchange should have happened with the verifier + secret.
    expect(capturedTokenRequest).not.toBeNull();
    expect(capturedTokenRequest!.url).toBe('https://oauth2.googleapis.com/token');
    expect(capturedTokenRequest!.body).toContain('code=auth-code-XYZ');
    expect(capturedTokenRequest!.body).toContain('code_verifier=verifier-test');
    expect(capturedTokenRequest!.body).toContain('client_secret=fake-secret');
    // Authorization header must NOT carry the bearer (it goes in the body).
    expect(capturedTokenRequest!.headers['authorization']).toBeUndefined();

    // State + verifier cookies cleared.
    const cleared = res.cookies.get(`shippie_oauth_state_${envelope.nonce}`);
    expect(cleared?.value).toBe('');
  });

  test('rejects callback when state cookie missing', async () => {
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('code', 'c');
    url.searchParams.set('state', 'unknown-nonce');
    const req = makeRequest(url.toString());
    const res = await handleCoordinator(req, { env });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('oauth_state_missing');
  });

  test('rejects callback when cookie state forged with wrong secret', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await deriveCodeChallenge(verifier);
    const envelope: OAuthEnvelope = {
      appSlug: 'recipes',
      nonce: 'nonce-bad',
      ts: Date.now(),
      provider: 'google-drive',
      codeChallenge: challenge,
    };
    const signed = await signEnvelope(envelope, 'WRONG_SECRET');
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('code', 'c');
    url.searchParams.set('state', envelope.nonce);
    const req = makeRequest(url.toString(), {
      cookies: {
        [`shippie_oauth_state_${envelope.nonce}`]: JSON.stringify(signed),
      },
    });
    const res = await handleCoordinator(req, { env });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('state_signature_mismatch');
  });

  test('surfaces token exchange failure as error page', async () => {
    const { envelope, signed } = await makeEnvelope({ nonce: 'nonce-fail' });
    const fetchImpl = (async () =>
      new Response('access_denied', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const url = new URL('https://shippie.app/oauth/google-drive');
    url.searchParams.set('code', 'rejected-code');
    url.searchParams.set('state', envelope.nonce);
    const req = makeRequest(url.toString(), {
      cookies: {
        [`shippie_oauth_state_${envelope.nonce}`]: JSON.stringify(signed),
        [`shippie_oauth_state_${envelope.nonce}_v`]: 'verifier-test',
      },
    });
    const res = await handleCoordinator(req, { env, fetchImpl });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('oauth_token_exchange_failed');
  });
});
