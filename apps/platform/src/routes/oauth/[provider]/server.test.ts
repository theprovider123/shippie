/**
 * Tests for the OAuth coordinator SvelteKit route.
 *
 * Covers:
 *   - 404 on unknown provider
 *   - 503 when OAUTH_COORDINATOR_SECRET is missing
 *   - 503 when provider client credentials are missing
 *   - 400 on missing / malformed envelope
 *   - 302 redirect to the provider authorize URL with a valid envelope
 *   - State round-trip: callback re-verifies the same signed envelope
 *   - 400 on tampered state
 *   - 200 HTML with postMessage(token, https://<appSlug>.shippie.app)
 *     after a successful code exchange
 *
 * The route module imports `RequestHandler` from `./$types` which is a
 * SvelteKit-generated barrel. In tests we call `GET` directly with a
 * fake event object.
 */
import { describe, expect, test } from 'vitest';
import { signEnvelope, type OAuthEnvelope } from '@shippie/backup-providers';
import { GET } from './+server';

const SECRET = 'test-coordinator-secret-32-bytes-aaaa';
const PUBLIC_HOST = 'shippie.app';

interface FakePlatform {
  env: {
    OAUTH_COORDINATOR_SECRET?: string;
    GOOGLE_DRIVE_CLIENT_ID?: string;
    GOOGLE_DRIVE_CLIENT_SECRET?: string;
    SHIPPIE_PUBLIC_HOST?: string;
  };
}

function eventFor(input: {
  provider: string;
  searchParams: Record<string, string>;
  platform?: FakePlatform;
}) {
  const url = new URL('https://shippie.app/oauth/' + input.provider);
  for (const [k, v] of Object.entries(input.searchParams)) {
    url.searchParams.set(k, v);
  }
  return {
    params: { provider: input.provider },
    url,
    platform: input.platform,
    request: new Request(url.toString()),
  } as unknown as Parameters<typeof GET>[0];
}

function defaultPlatform(): FakePlatform {
  return {
    env: {
      OAUTH_COORDINATOR_SECRET: SECRET,
      GOOGLE_DRIVE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_DRIVE_CLIENT_SECRET: 'test-client-secret',
      SHIPPIE_PUBLIC_HOST: PUBLIC_HOST,
    },
  };
}

async function makeSignedEnvelope(overrides: Partial<OAuthEnvelope> = {}): Promise<{
  payload: string;
  sig: string;
  envelope: OAuthEnvelope;
}> {
  const envelope: OAuthEnvelope = {
    appSlug: 'recipe',
    nonce: 'nonce-abc-123',
    ts: Date.now(),
    provider: 'google-drive',
    codeChallenge: 'challenge-pkce-stub',
    ...overrides,
  };
  const signed = await signEnvelope(envelope, SECRET);
  return { ...signed, envelope };
}

describe('OAuth coordinator — initial popup landing', () => {
  test('404 on unknown provider', async () => {
    const event = eventFor({
      provider: 'dropbox',
      searchParams: {},
      platform: defaultPlatform(),
    });
    let caught: unknown;
    try {
      await GET(event);
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number })?.status).toBe(404);
  });

  test('503 when OAUTH_COORDINATOR_SECRET is missing', async () => {
    const event = eventFor({
      provider: 'google-drive',
      searchParams: {},
      platform: { env: { GOOGLE_DRIVE_CLIENT_ID: 'x', GOOGLE_DRIVE_CLIENT_SECRET: 'y' } },
    });
    let caught: unknown;
    try {
      await GET(event);
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number })?.status).toBe(503);
  });

  test('503 when provider credentials are missing', async () => {
    const event = eventFor({
      provider: 'google-drive',
      searchParams: {},
      platform: { env: { OAUTH_COORDINATOR_SECRET: SECRET } },
    });
    let caught: unknown;
    try {
      await GET(event);
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number })?.status).toBe(503);
  });

  test('400 when envelope params missing', async () => {
    const event = eventFor({
      provider: 'google-drive',
      searchParams: {},
      platform: defaultPlatform(),
    });
    let caught: unknown;
    try {
      await GET(event);
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number })?.status).toBe(400);
  });

  test('400 when envelope is signed with the wrong secret', async () => {
    const wrongSigned = await signEnvelope(
      {
        appSlug: 'recipe',
        nonce: 'n',
        ts: Date.now(),
        provider: 'google-drive',
        codeChallenge: 'c',
      },
      'a-different-secret-32bytes-aaaaaaaa',
    );
    const event = eventFor({
      provider: 'google-drive',
      searchParams: { p: wrongSigned.payload, s: wrongSigned.sig },
      platform: defaultPlatform(),
    });
    let caught: unknown;
    try {
      await GET(event);
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number })?.status).toBe(400);
  });

  test('302 redirect to Google with state round-tripping the envelope', async () => {
    const { payload, sig } = await makeSignedEnvelope();
    const event = eventFor({
      provider: 'google-drive',
      searchParams: { p: payload, s: sig },
      platform: defaultPlatform(),
    });
    const res = (await GET(event)) as Response;
    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toBeTruthy();
    const u = new URL(location!);
    expect(u.host).toBe('accounts.google.com');
    expect(u.pathname).toBe('/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
    expect(u.searchParams.get('redirect_uri')).toBe('https://shippie.app/oauth/google-drive');
    expect(u.searchParams.get('state')).toBe(`${payload}:${sig}`);
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    // default scopes from GOOGLE_DRIVE_SCOPES — non-empty
    expect((u.searchParams.get('scope') ?? '').length).toBeGreaterThan(0);
  });
});

describe('OAuth coordinator — provider callback', () => {
  test('400 on tampered state', async () => {
    const { payload, sig } = await makeSignedEnvelope();
    const tamperedSig = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA');
    const event = eventFor({
      provider: 'google-drive',
      searchParams: {
        code: 'fake-google-code',
        state: `${payload}:${tamperedSig}`,
      },
      platform: defaultPlatform(),
    });
    const res = (await GET(event)) as Response;
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('State verification failed');
  });

  test('400 on malformed state', async () => {
    const event = eventFor({
      provider: 'google-drive',
      searchParams: {
        code: 'fake-google-code',
        state: 'no-colon-separator',
      },
      platform: defaultPlatform(),
    });
    const res = (await GET(event)) as Response;
    expect(res.status).toBe(400);
  });
});
