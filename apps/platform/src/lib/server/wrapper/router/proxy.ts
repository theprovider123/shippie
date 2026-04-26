/**
 * Reverse-proxy for source_kind='wrapped_url' apps. Ported from
 * services/worker/src/router/proxy.ts. Adapted to a single
 * `proxyWrappedApp({ ctx, wrap })` entry point that returns a Response.
 */
import type { WrapperContext } from '../env';
import type { WrapMetaRuntime } from '../platform-client';
import { injectPwaTags } from '../rewriter';

declare const HTMLRewriter: { new (): any };

const SHIPPIE_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https:; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Strip Domain attribute from a single Set-Cookie header. */
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

export function absoluteUrlRewriter(upstreamBase: string) {
  const base = new URL(upstreamBase);
  const rewriteAttr = (
    el: {
      getAttribute(n: string): string | null;
      setAttribute(n: string, v: string): void;
    },
    attr: string
  ) => {
    const val = el.getAttribute(attr);
    if (!val) return;
    try {
      const abs = new URL(val, upstreamBase);
      if (abs.host === base.host) {
        el.setAttribute(attr, abs.pathname + abs.search + abs.hash);
      }
    } catch {
      /* ignore */
    }
  };
  return new HTMLRewriter()
    .on('a[href], area[href], link[href]', {
      element: (el: never) => rewriteAttr(el as never, 'href')
    })
    .on(
      'img[src], script[src], source[src], iframe[src], video[src], audio[src]',
      { element: (el: never) => rewriteAttr(el as never, 'src') }
    )
    .on('form[action]', {
      element: (el: never) => rewriteAttr(el as never, 'action')
    });
}

export interface ProxyOpts {
  ctx: WrapperContext;
  wrap: WrapMetaRuntime;
}

export async function proxyWrappedApp(opts: ProxyOpts): Promise<Response> {
  const { ctx, wrap } = opts;
  const upstreamUrl = buildUpstreamUrl(wrap.upstreamUrl, ctx.request.url);
  const upstreamHeaders = new Headers(ctx.request.headers);
  upstreamHeaders.delete('host');
  upstreamHeaders.delete('content-length');

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: ctx.request.method,
      headers: upstreamHeaders,
      body: ['GET', 'HEAD'].includes(ctx.request.method)
        ? undefined
        : ctx.request.body,
      redirect: 'manual'
    });
  } catch (err) {
    return Response.json(
      { error: 'upstream_unreachable', message: String(err) },
      { status: 502 }
    );
  }

  const outHeaders = new Headers(upstream.headers);

  const rawCookies =
    typeof (upstream.headers as { getSetCookie?: () => string[] })
      .getSetCookie === 'function'
      ? (upstream.headers as { getSetCookie(): string[] }).getSetCookie()
      : upstream.headers.get('set-cookie')
        ? [upstream.headers.get('set-cookie')!]
        : [];
  if (rawCookies.length) {
    outHeaders.delete('set-cookie');
    for (const raw of rawCookies) {
      outHeaders.append('set-cookie', stripCookieDomain(raw));
    }
  }

  const loc = outHeaders.get('location');
  if (loc) outHeaders.set('location', rewriteLocation(loc, wrap.upstreamUrl));

  outHeaders.delete('content-security-policy');
  if (wrap.cspMode === 'lenient') {
    outHeaders.set('content-security-policy', SHIPPIE_CSP);
  } else if (upstream.headers.get('content-security-policy')) {
    outHeaders.set(
      'content-security-policy',
      upstream.headers.get('content-security-policy')!
    );
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const isBodyless =
    ctx.request.method === 'HEAD' ||
    upstream.status === 204 ||
    upstream.status === 304;
  let body: ReadableStream<Uint8Array> | null = upstream.body;
  if (
    !isBodyless &&
    body &&
    contentType.toLowerCase().includes('text/html')
  ) {
    const rewritten = absoluteUrlRewriter(wrap.upstreamUrl).transform(
      new Response(body, { headers: { 'content-type': 'text/html' } })
    );
    body = injectPwaTags(rewritten.body!, { slug: ctx.slug, contentType });
  }
  if (isBodyless) body = null;

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders
  });
}
