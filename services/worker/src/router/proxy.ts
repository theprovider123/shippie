// services/worker/src/router/proxy.ts
/**
 * Reverse-proxy router for source_kind='wrapped_url' apps.
 *
 * Mounted after slug resolution, before the static files router. For
 * every request we build an upstream Request, fetch it, and stream the
 * response back — injecting PWA tags on HTML, rewriting Set-Cookie
 * domains, and replacing CSP per mode.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { injectPwaTags } from '../rewriter.ts';

export interface WrapMeta {
  upstreamUrl: string;
  cspMode: 'lenient' | 'strict';
}

const SHIPPIE_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https:; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/**
 * Strip the Domain attribute from a SINGLE Set-Cookie header value.
 * Do not split on comma at the top level — cookie Expires dates contain commas.
 */
export function stripCookieDomain(singleSetCookie: string): string {
  return singleSetCookie
    .split(';')
    .filter((p) => !/^\s*Domain=/i.test(p))
    .join(';');
}

export function buildUpstreamUrl(upstreamBase: string, reqUrl: string): string {
  const base = new URL(upstreamBase);
  const req = new URL(reqUrl);
  return new URL(req.pathname + req.search, base).toString();
}

/**
 * If `Location` points at the upstream origin, rewrite to path+search so the
 * browser stays on the proxy origin.
 */
export function rewriteLocation(loc: string, upstreamBase: string): string {
  try {
    const abs = new URL(loc, upstreamBase);
    const base = new URL(upstreamBase);
    if (abs.host === base.host) return abs.pathname + abs.search + abs.hash;
    return loc;
  } catch {
    return loc;
  }
}

/**
 * Hook set added to the HTMLRewriter chain: rewrite any src/href that points
 * at the upstream origin to a path-relative URL so browsers stay on the proxy.
 * Runs in addition to the manifest/SDK injection in ./rewriter.ts.
 */
declare const HTMLRewriter: { new (): any };

export function absoluteUrlRewriter(upstreamBase: string) {
  const base = new URL(upstreamBase);
  const rewriteAttr = (
    el: { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void },
    attr: string,
  ) => {
    const val = el.getAttribute(attr);
    if (!val) return;
    try {
      const abs = new URL(val, upstreamBase);
      if (abs.host === base.host) el.setAttribute(attr, abs.pathname + abs.search + abs.hash);
    } catch {
      /* ignore */
    }
  };
  return new HTMLRewriter()
    .on('a[href], area[href], link[href]', {
      element: (el: never) => rewriteAttr(el as never, 'href'),
    })
    .on('img[src], script[src], source[src], iframe[src], video[src], audio[src]', {
      element: (el: never) => rewriteAttr(el as never, 'src'),
    })
    .on('form[action]', { element: (el: never) => rewriteAttr(el as never, 'action') });
}

export function proxyRouter(loadMeta: (slug: string) => WrapMeta | Promise<WrapMeta>) {
  const router = new Hono<AppBindings>();

  router.all('*', async (c) => {
    const meta = await loadMeta(c.var.slug);
    if (!meta) return c.json({ error: 'wrap_config_missing' }, 500);

    const upstreamUrl = buildUpstreamUrl(meta.upstreamUrl, c.req.url);
    const upstreamHeaders = new Headers(c.req.raw.headers);
    upstreamHeaders.delete('host');
    upstreamHeaders.delete('content-length');

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method: c.req.method,
        headers: upstreamHeaders,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
        redirect: 'manual',
      });
    } catch (err) {
      return c.json({ error: 'upstream_unreachable', message: String(err) }, 502);
    }

    const outHeaders = new Headers(upstream.headers);

    // Cookie domain stripping — iterate every Set-Cookie, not just the first.
    // Headers.getSetCookie() exists in Bun + Workers; fall back to the single
    // getter if we're on a runtime that doesn't have it yet.
    const rawCookies =
      typeof (upstream.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (upstream.headers as { getSetCookie(): string[] }).getSetCookie()
        : upstream.headers.get('set-cookie')
          ? [upstream.headers.get('set-cookie')!]
          : [];
    if (rawCookies.length) {
      outHeaders.delete('set-cookie');
      for (const raw of rawCookies) outHeaders.append('set-cookie', stripCookieDomain(raw));
    }

    // Location rewriting — keep the browser on the proxy origin.
    const loc = outHeaders.get('location');
    if (loc) outHeaders.set('location', rewriteLocation(loc, meta.upstreamUrl));

    // CSP replacement
    outHeaders.delete('content-security-policy');
    if (meta.cspMode === 'lenient') {
      outHeaders.set('content-security-policy', SHIPPIE_CSP);
    } else if (upstream.headers.get('content-security-policy')) {
      outHeaders.set('content-security-policy', upstream.headers.get('content-security-policy')!);
    }

    // HTML transform: inject PWA tags AND rewrite upstream-absolute URLs so
    // browser-initiated sub-requests (img, script, fetch-as-navigation) stay
    // on the proxy origin. Skip for HEAD (no body to rewrite) and for
    // responses with no body at all.
    const contentType = upstream.headers.get('content-type') ?? '';
    const isBodyless = c.req.method === 'HEAD' || upstream.status === 204 || upstream.status === 304;
    let body: ReadableStream<Uint8Array> | null = upstream.body;
    if (!isBodyless && body && contentType.toLowerCase().includes('text/html')) {
      // First pass: rewrite absolute URLs via a dedicated rewriter.
      const rewritten = absoluteUrlRewriter(meta.upstreamUrl).transform(
        new Response(body, { headers: { 'content-type': 'text/html' } }),
      );
      // Second pass: PWA injection.
      body = injectPwaTags(rewritten.body!, { slug: c.var.slug, contentType });
    }
    if (isBodyless) body = null;

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  });

  return router;
}
