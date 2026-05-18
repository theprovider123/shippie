import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
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
    expect(result.error).toContain('path not found');
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

  test('sends remix lineage and same-origin header to the deploy endpoint', async () => {
    const calls: Array<{ url: string; origin: string | null; remixFrom: FormDataEntryValue | null }> = [];
    globalThis.fetch = (async (input, init) => {
      const body = init?.body as FormData;
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        origin: headers.get('origin'),
        remixFrom: body.get('remix_from'),
      });
      return new Response(
        JSON.stringify({
          success: true,
          slug: 'better-recipes',
          live_url: 'https://better-recipes.shippie.app/',
          deploy_id: 'dep_1',
          version: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: 'tok' },
      { directory: TMP, slug: 'better-recipes', remixFrom: 'recipe-saver' },
    );

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { url: 'https://example.com/api/deploy', origin: 'https://example.com', remixFrom: 'recipe-saver' },
    ]);
  });

  test('wraps a single html file and defaults it to unlisted', async () => {
    const htmlFile = join(TMP, 'Ticket Prioritizer.html');
    writeFileSync(htmlFile, '<!doctype html><title>Tickets</title><main>ok</main>');
    const calls: Array<{
      slug: FormDataEntryValue | null;
      visibility: FormDataEntryValue | null;
      files: string[];
      dataMode: string | undefined;
    }> = [];
    globalThis.fetch = (async (_input, init) => {
      const body = init?.body as FormData;
      const zipFile = body.get('zip') as File;
      const buffer = Buffer.from(await zipFile.arrayBuffer());
      const zip = new AdmZip(buffer);
      const manifest = JSON.parse(zip.readAsText('shippie.json')) as {
        data?: { mode?: string };
      };
      calls.push({
        slug: body.get('slug'),
        visibility: body.get('visibility'),
        files: zip.getEntries().map((entry) => entry.entryName).sort(),
        dataMode: manifest.data?.mode,
      });
      return new Response(
        JSON.stringify({
          success: true,
          slug: 'ticket-prioritizer',
          live_url: 'https://ticket-prioritizer.shippie.app/',
          visibility_scope: 'unlisted',
          deploy_id: 'dep_1',
          version: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: 'tok' },
      { directory: htmlFile },
    );

    expect(result.ok).toBe(true);
    expect(result.visibility).toBe('unlisted');
    expect(calls).toEqual([
      {
        slug: 'ticket-prioritizer',
        visibility: 'unlisted',
        files: ['index.html', 'shippie.json'],
        dataMode: 'shippie-documents',
      },
    ]);
  });
});
