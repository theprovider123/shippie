/**
 * OAuth coordinator — client side.
 *
 * Architecture:
 *   - Single redirect URI per provider: https://shippie.app/oauth/<provider>.
 *   - One OAuth client registration on the provider side serves every
 *     Shippie app. The originating maker app's identity (slug + nonce)
 *     is carried in the `state` parameter, HMAC'd with
 *     `OAUTH_COORDINATOR_SECRET` so it can't be forged.
 *   - PKCE: the maker app generates the code_verifier locally; the
 *     coordinator only sees the code_challenge in the `state` envelope
 *     it round-trips.  When the coordinator exchanges the code, it
 *     forwards the verifier (extracted from a short-lived signed
 *     channel back via the popup), so Shippie's server never sees
 *     a long-lived secret tied to the user.
 *
 * For tests we extract the pure helpers (state envelope, PKCE), and
 * keep the popup orchestration as a separate function `requestToken`
 * that callers invoke from a real browser.
 */

import type { BackupProviderId, OAuthToken } from './types.ts';

export interface OAuthEnvelope {
  /** Slug of the maker app initiating the flow (e.g. `recipes`). */
  appSlug: string;
  /** Random nonce — prevents replay across simultaneous flows. */
  nonce: string;
  /** Epoch millis when the envelope was minted. */
  ts: number;
  /** Provider ID this state is destined for. */
  provider: BackupProviderId;
  /** PKCE code_challenge (S256). The verifier stays in the maker app. */
  codeChallenge: string;
}

export interface SignedEnvelope {
  /** Base64url-encoded JSON of the envelope. */
  payload: string;
  /** Base64url-encoded HMAC-SHA256 signature over `payload`. */
  sig: string;
}

const TEXT_ENC = new TextEncoder();
const TEXT_DEC = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(TEXT_ENC.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signEnvelope(
  envelope: OAuthEnvelope,
  secret: string,
): Promise<SignedEnvelope> {
  const json = JSON.stringify(envelope);
  const payloadBytes = TEXT_ENC.encode(json);
  const payload = base64UrlEncode(payloadBytes);
  const key = await importHmacKey(secret);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, toArrayBuffer(TEXT_ENC.encode(payload))),
  );
  return { payload, sig: base64UrlEncode(sigBytes) };
}

export interface VerifyOptions {
  /** TTL in millis — defaults to 10 minutes per spec. */
  ttlMs?: number;
  /** Override `Date.now()` for testing. */
  now?: number;
  /** Restrict to a specific provider. */
  expectedProvider?: BackupProviderId;
}

export async function verifyEnvelope(
  signed: SignedEnvelope,
  secret: string,
  opts: VerifyOptions = {},
): Promise<{ ok: true; envelope: OAuthEnvelope } | { ok: false; reason: string }> {
  const ttl = opts.ttlMs ?? 10 * 60 * 1000;
  const now = opts.now ?? Date.now();
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64UrlDecode(signed.payload);
    sigBytes = base64UrlDecode(signed.sig);
  } catch {
    return { ok: false, reason: 'state_decode_failed' };
  }
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(sigBytes),
    toArrayBuffer(TEXT_ENC.encode(signed.payload)),
  );
  if (!valid) return { ok: false, reason: 'state_signature_mismatch' };
  let envelope: OAuthEnvelope;
  try {
    envelope = JSON.parse(TEXT_DEC.decode(payloadBytes)) as OAuthEnvelope;
  } catch {
    return { ok: false, reason: 'state_payload_invalid' };
  }
  if (typeof envelope.ts !== 'number' || now - envelope.ts > ttl) {
    return { ok: false, reason: 'state_expired' };
  }
  if (now < envelope.ts - 60_000) {
    return { ok: false, reason: 'state_clock_skew' };
  }
  if (opts.expectedProvider && envelope.provider !== opts.expectedProvider) {
    return { ok: false, reason: 'state_provider_mismatch' };
  }
  if (!envelope.appSlug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(envelope.appSlug)) {
    return { ok: false, reason: 'state_app_slug_invalid' };
  }
  return { ok: true, envelope };
}

/**
 * PKCE helpers — RFC 7636.
 */
export function generateCodeVerifier(byteLen = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLen)));
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', toArrayBuffer(TEXT_ENC.encode(verifier))),
  );
  return base64UrlEncode(hash);
}

export interface RequestTokenOptions {
  provider: BackupProviderId;
  appSlug: string;
  /** OAuth scopes to request; provider-specific. */
  scopes: string[];
  /**
   * Overrides for tests / non-default deployments. Defaults to
   * `https://shippie.app/oauth/<provider>`.
   */
  coordinatorOrigin?: string;
  /** Override popup creation for tests. */
  openPopup?: (url: string) => { close(): void; closed: boolean } | null;
  /**
   * Inject the message bus for tests. Defaults to `window`. Listen
   * for `oauth-result` postMessage from the coordinator origin.
   */
  bus?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Test injection — produce challenge/verifier without crypto. */
  pkce?: { verifier: string; challenge: string };
  /** Test injection — produce envelope nonce + ts. */
  envelopeOverrides?: { nonce: string; ts: number; signed: SignedEnvelope };
  /** Timeout in ms for the popup flow. Default 5 minutes. */
  timeoutMs?: number;
}

export interface RequestTokenResult {
  token: OAuthToken;
  envelope: OAuthEnvelope;
}

/**
 * Build the URL the maker app opens in a popup. Pure — no DOM required.
 */
export function buildAuthorizeUrl(input: {
  provider: BackupProviderId;
  signedState: SignedEnvelope;
  scopes: string[];
  coordinatorOrigin?: string;
}): string {
  const origin = input.coordinatorOrigin ?? 'https://shippie.app';
  const params = new URLSearchParams();
  params.set('p', input.signedState.payload);
  params.set('s', input.signedState.sig);
  params.set('scope', input.scopes.join(' '));
  return `${origin}/oauth/${input.provider}?${params.toString()}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
