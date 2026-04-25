/**
 * Tests for the OAuth coordinator helper functions — pure crypto and
 * URL building, no DOM required. The Next.js route handler is tested
 * separately under apps/web.
 */
import { describe, expect, test } from 'bun:test';
import {
  signEnvelope,
  verifyEnvelope,
  generateCodeVerifier,
  deriveCodeChallenge,
  buildAuthorizeUrl,
  base64UrlEncode,
  base64UrlDecode,
  type OAuthEnvelope,
} from './oauth-coordinator.ts';

const SECRET = 'test-coordinator-secret';
const baseEnvelope: OAuthEnvelope = {
  appSlug: 'recipes',
  nonce: 'n-1234',
  ts: Date.now(),
  provider: 'google-drive',
  codeChallenge: 'abc123',
};

describe('base64url', () => {
  test('round-trip encode/decode', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const enc = base64UrlEncode(bytes);
    expect(enc).not.toContain('=');
    expect(enc).not.toContain('+');
    expect(enc).not.toContain('/');
    const dec = base64UrlDecode(enc);
    expect([...dec]).toEqual([...bytes]);
  });
});

describe('signEnvelope / verifyEnvelope', () => {
  test('signed envelope round-trips', async () => {
    const signed = await signEnvelope(baseEnvelope, SECRET);
    const result = await verifyEnvelope(signed, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.appSlug).toBe('recipes');
      expect(result.envelope.provider).toBe('google-drive');
    }
  });

  test('rejects forged signature', async () => {
    const signed = await signEnvelope(baseEnvelope, SECRET);
    const result = await verifyEnvelope(signed, 'WRONG_SECRET');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_signature_mismatch');
  });

  test('rejects tampered payload', async () => {
    const signed = await signEnvelope(baseEnvelope, SECRET);
    // Flip a bit in the payload (decode→tweak→encode).
    const decoded = base64UrlDecode(signed.payload);
    decoded[0] = decoded[0]! ^ 0x01;
    const tampered = { ...signed, payload: base64UrlEncode(decoded) };
    const result = await verifyEnvelope(tampered, SECRET);
    expect(result.ok).toBe(false);
  });

  test('rejects expired envelopes (TTL 10 min default)', async () => {
    const expired: OAuthEnvelope = { ...baseEnvelope, ts: Date.now() - 20 * 60 * 1000 };
    const signed = await signEnvelope(expired, SECRET);
    const result = await verifyEnvelope(signed, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_expired');
  });

  test('rejects future-dated envelopes (clock skew guard)', async () => {
    const future: OAuthEnvelope = { ...baseEnvelope, ts: Date.now() + 5 * 60 * 1000 };
    const signed = await signEnvelope(future, SECRET);
    const result = await verifyEnvelope(signed, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_clock_skew');
  });

  test('rejects mismatched provider', async () => {
    const signed = await signEnvelope(baseEnvelope, SECRET);
    const result = await verifyEnvelope(signed, SECRET, {
      expectedProvider: 'google-drive',
    });
    expect(result.ok).toBe(true);
    // Cast to a fictional other provider to test the negative path.
    const mismatch = await verifyEnvelope(signed, SECRET, {
      // @ts-expect-error -- intentional invalid provider for test
      expectedProvider: 'dropbox',
    });
    expect(mismatch.ok).toBe(false);
  });

  test('rejects invalid app slug', async () => {
    const bad: OAuthEnvelope = { ...baseEnvelope, appSlug: 'CAPS-not-allowed' };
    const signed = await signEnvelope(bad, SECRET);
    const result = await verifyEnvelope(signed, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_app_slug_invalid');
  });
});

describe('PKCE helpers', () => {
  test('verifier is base64url and >= 43 chars', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v).not.toContain('+');
    expect(v).not.toContain('/');
    expect(v).not.toContain('=');
  });

  test('challenge derives deterministically', async () => {
    const c1 = await deriveCodeChallenge('verifier-abc');
    const c2 = await deriveCodeChallenge('verifier-abc');
    expect(c1).toBe(c2);
    const c3 = await deriveCodeChallenge('verifier-xyz');
    expect(c1).not.toBe(c3);
  });
});

describe('buildAuthorizeUrl', () => {
  test('encodes envelope payload + sig + scopes into the URL', async () => {
    const signed = await signEnvelope(baseEnvelope, SECRET);
    const url = buildAuthorizeUrl({
      provider: 'google-drive',
      signedState: signed,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    expect(url).toContain('https://shippie.app/oauth/google-drive');
    expect(url).toContain(`p=${encodeURIComponent(signed.payload)}`);
    expect(url).toContain(`s=${encodeURIComponent(signed.sig)}`);
    expect(url).toContain('scope=');
  });

  test('respects custom coordinator origin', async () => {
    const signed = await signEnvelope(baseEnvelope, SECRET);
    const url = buildAuthorizeUrl({
      provider: 'google-drive',
      signedState: signed,
      scopes: [],
      coordinatorOrigin: 'http://localhost:4100',
    });
    expect(url.startsWith('http://localhost:4100/oauth/google-drive')).toBe(true);
  });
});
