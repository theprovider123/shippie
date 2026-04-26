/**
 * Tests for the OAuth-start route — the server-side entry point that
 * mints + signs an OAuth state envelope on behalf of a maker app, then
 * 302-redirects to the coordinator.
 */
import { describe, expect, test } from 'vitest';
import { verifyEnvelope, type SignedEnvelope } from '@shippie/backup-providers';
import { GET } from './+server';

const SECRET = 'test-coordinator-secret-32bytes-aaaa';

interface FakePlatform {
  env: { OAUTH_COORDINATOR_SECRET?: string; SHIPPIE_PUBLIC_HOST?: string };
}

function eventFor(input: { searchParams: Record<string, string>; platform?: FakePlatform }) {
  const url = new URL('https://shippie.app/__shippie/oauth/start');
  for (const [k, v] of Object.entries(input.searchParams)) url.searchParams.set(k, v);
  return {
    url,
    platform: input.platform ?? { env: { OAUTH_COORDINATOR_SECRET: SECRET, SHIPPIE_PUBLIC_HOST: 'shippie.app' } },
    request: new Request(url.toString()),
  } as unknown as Parameters<typeof GET>[0];
}

async function expectThrowStatus(promise: unknown, status: number) {
  let caught: unknown;
  try {
    await Promise.resolve(promise);
  } catch (err) {
    caught = err;
  }
  expect((caught as { status?: number })?.status).toBe(status);
}

describe('OAuth start — input validation', () => {
  test('400 on unsupported provider', async () => {
    await expectThrowStatus(
      GET(eventFor({ searchParams: { provider: 'dropbox', app: 'recipe', v: 'c' } })),
      400,
    );
  });

  test('400 on missing/invalid app slug', async () => {
    await expectThrowStatus(
      GET(eventFor({ searchParams: { provider: 'google-drive', v: 'c' } })),
      400,
    );
    await expectThrowStatus(
      GET(eventFor({ searchParams: { provider: 'google-drive', app: 'BadSlug!', v: 'c' } })),
      400,
    );
  });

  test('503 when OAUTH_COORDINATOR_SECRET missing', async () => {
    await expectThrowStatus(
      GET(
        eventFor({
          searchParams: { provider: 'google-drive', app: 'recipe', v: 'c' },
          platform: { env: {} },
        }),
      ),
      503,
    );
  });
});

describe('OAuth start — happy path', () => {
  test('302 to coordinator with signed envelope and default scopes', async () => {
    let caught: unknown;
    try {
      await Promise.resolve(
        GET(
          eventFor({
            searchParams: { provider: 'google-drive', app: 'recipe', v: 'pkce-challenge' },
          }),
        ),
      );
    } catch (err) {
      caught = err;
    }
    // SvelteKit redirect throws an object with status 302 + location.
    const r = caught as { status?: number; location?: string };
    expect(r.status).toBe(302);
    expect(r.location).toBeTruthy();
    const url = new URL(r.location!);
    expect(url.host).toBe('shippie.app');
    expect(url.pathname).toBe('/oauth/google-drive');
    expect(url.searchParams.get('p')).toBeTruthy();
    expect(url.searchParams.get('s')).toBeTruthy();
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');

    const signed: SignedEnvelope = {
      payload: url.searchParams.get('p')!,
      sig: url.searchParams.get('s')!,
    };
    const verified = await verifyEnvelope(signed, SECRET, { expectedProvider: 'google-drive' });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.envelope.appSlug).toBe('recipe');
      expect(verified.envelope.codeChallenge).toBe('pkce-challenge');
    }
  });

  test('respects SHIPPIE_PUBLIC_HOST override', async () => {
    let caught: unknown;
    try {
      await Promise.resolve(
        GET(
          eventFor({
            searchParams: { provider: 'google-drive', app: 'recipe', v: 'c' },
            platform: { env: { OAUTH_COORDINATOR_SECRET: SECRET, SHIPPIE_PUBLIC_HOST: 'preview.shippie.app' } },
          }),
        ),
      );
    } catch (err) {
      caught = err;
    }
    const r = caught as { status?: number; location?: string };
    expect(r.status).toBe(302);
    expect(new URL(r.location!).host).toBe('preview.shippie.app');
  });
});
