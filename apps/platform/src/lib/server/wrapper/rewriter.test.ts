/**
 * Ported from services/worker/src/rewriter.test.ts. Vitest replaces bun:test.
 *
 * NOTE: HTMLRewriter is a Cloudflare Workers / Bun runtime global. Vitest
 * runs in Node where it doesn't exist, so we install a minimal polyfill
 * (see __test-helpers__/htmlrewriter-polyfill.ts) that implements only the
 * surface used by `injectPwaTags`. Production still runs on the workers
 * runtime; the polyfill is unit-test scaffolding.
 */
import { describe, expect, test } from 'vitest';
import { installHTMLRewriterPolyfill } from './__test-helpers__/htmlrewriter-polyfill';

installHTMLRewriterPolyfill();

import { injectPwaTags } from './rewriter';

const BASE_HTML =
  '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';

describe('injectPwaTags (HTMLRewriter present)', () => {
  test('inserts manifest link and SDK script before </head>', async () => {
    const stream = new Response(BASE_HTML).body!;
    const rewritten = await new Response(
      injectPwaTags(stream, { slug: 'mevrouw', contentType: 'text/html' })
    ).text();
    expect(rewritten).toContain('<link rel="manifest" href="/__shippie/manifest"');
    expect(rewritten).toContain('<script src="/__shippie/sdk.js" async');
  });

  test('passes non-HTML bodies through unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stream = new Response(bytes).body!;
    const out = new Uint8Array(
      await new Response(
        injectPwaTags(stream, { slug: 'x', contentType: 'image/png' })
      ).arrayBuffer()
    );
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });
});

describe('injectPwaTags (always)', () => {
  test('returns the stream untouched for non-HTML content-type', async () => {
    // This branch doesn't touch HTMLRewriter — safe to run anywhere.
    const bytes = new Uint8Array([9, 8, 7]);
    const stream = new Response(bytes).body!;
    const out = injectPwaTags(stream, { slug: 'x', contentType: 'image/png' });
    expect(out).toBe(stream);
  });
});
