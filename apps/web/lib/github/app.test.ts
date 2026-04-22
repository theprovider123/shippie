/**
 * Tests for the GitHub App installation-token cache.
 *
 * Proves:
 *   - First call for a given installation_id issues a real POST to
 *     GitHub's installations/{id}/access_tokens endpoint and returns
 *     the upstream token.
 *   - Subsequent calls within the TTL return the same token without
 *     hitting the network again.
 *   - Distinct installation ids maintain independent cache entries.
 *   - `__clearInstallationTokenCache()` makes the next call miss.
 *
 * The JWT that `getInstallationToken` sends to GitHub is signed with a
 * real RSA-2048 keypair generated in-test (no external key fixture
 * needed). `fetch` is stubbed so no network call actually happens —
 * we just count invocations and assert on the Authorization header
 * format.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { getInstallationToken, __clearInstallationTokenCache } from './app.ts';

const ORIGINAL_APP_ID = process.env.GITHUB_APP_ID;
const ORIGINAL_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const ORIGINAL_FETCH = globalThis.fetch;

let calls: Array<{ url: string; headers: Record<string, string> }> = [];
let nextToken = 'token-from-github';

function makePemBase64(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  return Buffer.from(pem).toString('base64');
}

beforeEach(() => {
  process.env.GITHUB_APP_ID = '12345';
  process.env.GITHUB_APP_PRIVATE_KEY = makePemBase64();
  __clearInstallationTokenCache();
  calls = [];
  nextToken = 'token-from-github';
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), headers });
    return Promise.resolve(
      new Response(JSON.stringify({ token: nextToken }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_APP_ID === undefined) delete process.env.GITHUB_APP_ID;
  else process.env.GITHUB_APP_ID = ORIGINAL_APP_ID;
  if (ORIGINAL_PRIVATE_KEY === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
  else process.env.GITHUB_APP_PRIVATE_KEY = ORIGINAL_PRIVATE_KEY;
});

test('first call hits GitHub and returns the upstream token', async () => {
  const tok = await getInstallationToken(42);
  assert.equal(tok, 'token-from-github');
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.url.endsWith('/app/installations/42/access_tokens'));
  assert.match(calls[0]!.headers.authorization!, /^Bearer [A-Za-z0-9_.-]+$/);
});

test('second call for the same installation returns cached token (no new fetch)', async () => {
  const a = await getInstallationToken(42);
  // Simulate GitHub rotating to a new token — cached caller shouldn't see it
  nextToken = 'token-rotated';
  const b = await getInstallationToken(42);
  assert.equal(a, b);
  assert.equal(a, 'token-from-github');
  assert.equal(calls.length, 1);
});

test('distinct installation ids use independent cache entries', async () => {
  nextToken = 'token-42';
  await getInstallationToken(42);
  nextToken = 'token-99';
  const tok99 = await getInstallationToken(99);
  assert.equal(tok99, 'token-99');
  assert.equal(calls.length, 2);

  // Re-request 42 — should still be the first cached token
  nextToken = 'should-not-see-this';
  const tok42 = await getInstallationToken(42);
  assert.equal(tok42, 'token-42');
  assert.equal(calls.length, 2);
});

test('__clearInstallationTokenCache forces next call to miss', async () => {
  await getInstallationToken(42);
  __clearInstallationTokenCache();
  nextToken = 'fresh-token';
  const tok = await getInstallationToken(42);
  assert.equal(tok, 'fresh-token');
  assert.equal(calls.length, 2);
});

test('non-2xx from GitHub throws with status + body', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('{"message":"Bad credentials"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )) as unknown as typeof fetch;

  await assert.rejects(
    () => getInstallationToken(1),
    /GitHub installation token failed: 401/,
  );
});
