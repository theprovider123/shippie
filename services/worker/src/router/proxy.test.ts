// services/worker/src/router/proxy.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { proxyRouter } from './proxy';
import type { AppBindings } from '../app';

// Sibling test files (beacon/push/handoff) overwrite globalThis.fetch in
// their beforeEach and don't restore it. bun test runs files concurrently
// against a shared global scope, so when proxy.ts calls fetch() it can
// land on whichever mock was last installed. Restore the real fetch
// (via Bun.fetch, which isn't reassignable) for every proxy test.
beforeEach(() => {
  globalThis.fetch = Bun.fetch as unknown as typeof fetch;
});

// Stand up a fake upstream on an ephemeral port
let upstream: ReturnType<typeof Bun.serve>;
let upstreamUrl = '';

beforeEach(() => {
  upstream = Bun.serve({
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/') {
        return new Response(
          '<!doctype html><html><head><title>t</title></head><body>hi</body></html>',
          { headers: { 'content-type': 'text/html', 'set-cookie': 'id=abc; Domain=upstream.example' } },
        );
      }
      if (u.pathname === '/api/ping') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('404', { status: 404 });
    },
  });
  upstreamUrl = `http://localhost:${upstream.port}`;
});
afterEach(() => upstream.stop(true));

function appWithMeta(slug: string) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('slug', slug);
    c.set('traceId', 'test');
    await next();
  });
  app.route('/', proxyRouter(() => ({ upstreamUrl, cspMode: 'lenient' })));
  return app;
}

describe('proxyRouter', () => {
  test('HTML response has SDK injected', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const text = await res.text();
    expect(text).toContain('/__shippie/sdk.js');
  });

  test('JSON response passes through', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('strips Domain attribute from upstream Set-Cookie', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toContain('id=abc');
    expect(sc.toLowerCase()).not.toContain('domain=');
  });

  test('preserves Expires attribute (comma inside value)', async () => {
    // Upstream that emits a cookie containing a literal comma inside Expires.
    upstream.stop(true);
    upstream = Bun.serve({
      port: 0,
      fetch: () =>
        new Response('<html><head></head><body>x</body></html>', {
          headers: {
            'content-type': 'text/html',
            'set-cookie': 'sid=abc; Domain=upstream.example; Expires=Wed, 09 Jun 2021 10:18:14 GMT',
          },
        }),
    });
    upstreamUrl = `http://localhost:${upstream.port}`;
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toContain('sid=abc');
    expect(sc).toContain('Expires=Wed, 09 Jun 2021');
    expect(sc.toLowerCase()).not.toContain('domain=');
  });

  test('rewrites same-host Location redirect to path-relative', async () => {
    upstream.stop(true);
    upstream = Bun.serve({
      port: 0,
      fetch: (req) => {
        const u = new URL(req.url);
        return new Response('', {
          status: 302,
          headers: { location: `${u.origin}/after` },
        });
      },
    });
    upstreamUrl = `http://localhost:${upstream.port}`;
    const app = appWithMeta('mevrouw');
    const res = await app.request('/before');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/after');
  });

  test('rewrites upstream-absolute URLs in HTML to path-relative', async () => {
    upstream.stop(true);
    upstream = Bun.serve({
      port: 0,
      fetch: (req) => {
        const base = new URL(req.url).origin;
        return new Response(
          `<!doctype html><html><head></head><body><img src="${base}/img.png"><a href="${base}/next">x</a></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        );
      },
    });
    upstreamUrl = `http://localhost:${upstream.port}`;
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const html = await res.text();
    expect(html).toContain('src="/img.png"');
    expect(html).toContain('href="/next"');
    expect(html).not.toContain(`localhost:${upstream.port}`);
  });

  test('replaces upstream CSP with Shippie CSP in lenient mode', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
  });
});
