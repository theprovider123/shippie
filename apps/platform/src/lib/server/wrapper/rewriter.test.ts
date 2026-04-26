/**
 * Ported from services/worker/src/rewriter.test.ts. Vitest replaces bun:test.
 *
 * NOTE: HTMLRewriter is a Cloudflare Workers / Bun runtime global. Vitest
 * runs in Node, where HTMLRewriter doesn't exist by default. We skip
 * these tests when HTMLRewriter is undefined; the wrangler-runtime
 * smoke tests catch the real injection behavior.
 */
import { describe, expect, test } from 'vitest';
import { injectPwaTags } from './rewriter';

const BASE_HTML =
  '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';

const hasRewriter = typeof (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter !== 'undefined';

(hasRewriter ? describe : describe.skip)('injectPwaTags (HTMLRewriter present)', () => {
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
