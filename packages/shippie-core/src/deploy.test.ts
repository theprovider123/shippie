import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployDirectory } from './deploy.ts';

const TMP = join(tmpdir(), 'shippie-core-deploy-test-' + Date.now());
const originalFetch = globalThis.fetch;

describe('deployDirectory', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'index.html'), '<html>ok</html>');
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    try {
      rmSync(TMP, { recursive: true, force: true });
    } catch {}
  });

  test('returns error when directory missing', async () => {
    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: 'tok' },
      { directory: '/no/such/path' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('directory not found');
  });

  test('non-trial deploy without token surfaces no_auth_token', async () => {
    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: null },
      { directory: TMP, slug: 'test-app' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no_auth_token');
  });

  test('preserves preflight blockers and prefers maker-facing reason on failed deploy', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: 'preflight_failed',
          reason: 'Stripe secret key in client bundle',
          preflight: {
            passed: false,
            findings: [],
            warnings: [],
            blockers: [
              {
                rule: 'security:secret_stripe_key',
                severity: 'block',
                title: 'Stripe secret key in client bundle',
                detail: 'assets/app.js: Stripe secret keys must never reach the browser.',
              },
            ],
            durationMs: 4,
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: 'tok' },
      { directory: TMP, slug: 'test-app' },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Stripe secret key in client bundle');
    expect(result.preflight?.passed).toBe(false);
    expect(result.preflight?.blockers).toEqual([
      {
        rule: 'security:secret_stripe_key',
        severity: 'block',
        title: 'Stripe secret key in client bundle',
        detail: 'assets/app.js: Stripe secret keys must never reach the browser.',
      },
    ]);
  });
});
