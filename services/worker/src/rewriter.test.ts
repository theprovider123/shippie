// services/worker/src/rewriter.test.ts
import { describe, expect, test } from 'bun:test';
import { injectPwaTags } from './rewriter';

const BASE_HTML = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';

describe('injectPwaTags', () => {
  test('inserts manifest link and SDK script before </head>', async () => {
    const stream = new Response(BASE_HTML).body!;
    const rewritten = await new Response(
      injectPwaTags(stream, { slug: 'mevrouw', contentType: 'text/html' }),
    ).text();
    expect(rewritten).toContain('<link rel="manifest" href="/__shippie/manifest"');
    expect(rewritten).toContain('<script src="/__shippie/sdk.js" async');
    expect(rewritten.indexOf('</head>')).toBeGreaterThan(
      rewritten.indexOf('<script src="/__shippie/sdk.js'),
    );
  });

  test('does not double-inject when SDK tag already present', async () => {
    const html = BASE_HTML.replace(
      '</head>',
      '<script src="/__shippie/sdk.js"></script></head>',
    );
    const stream = new Response(html).body!;
    const out = await new Response(
      injectPwaTags(stream, { slug: 'mevrouw', contentType: 'text/html' }),
    ).text();
    const count = (out.match(/\/__shippie\/sdk\.js/g) ?? []).length;
    expect(count).toBe(1);
  });

  test('passes non-HTML bodies through unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stream = new Response(bytes).body!;
    const out = await new Response(
      injectPwaTags(stream, { slug: 'x', contentType: 'image/png' }),
    ).bytes();
    expect(out).toEqual(bytes);
  });

  test('falls back to injecting before <body> when HTML has no <head>', async () => {
    const noHead = '<!doctype html><html><body>hi</body></html>';
    const stream = new Response(noHead).body!;
    const out = await new Response(
      injectPwaTags(stream, { slug: 'x', contentType: 'text/html' }),
    ).text();
    expect(out).toContain('/__shippie/sdk.js');
    expect(out).toContain('/__shippie/manifest');
  });
});
