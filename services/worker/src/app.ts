/**
 * Hono app factory.
 *
 * Produces a portable Hono app that can run in Cloudflare Workers, Bun,
 * Node, or any other fetch-compatible runtime. Host header → slug
 * resolution happens in middleware so every __shippie/* route has
 * `c.var.slug` populated.
 *
 * Spec v6 §2.1 (runtime plane), §5 (reserved routes).
 */
import { Hono } from 'hono';
import type { WorkerEnv } from './env.ts';
import { resolveAppSlug, resolveHostFull } from './routing.ts';
import { systemRouter } from './router/system.ts';
import { filesRouter } from './router/files.ts';

export interface AppBindings {
  Bindings: WorkerEnv;
  Variables: {
    slug: string;
  };
}

export function createApp() {
  const app = new Hono<AppBindings>();

  // ------------------------------------------------------------------
  // Slug resolution — every request gets `c.var.slug`
  // ------------------------------------------------------------------
  app.use('*', async (c, next) => {
    // Try sync resolution first (subdomains), then async (custom domains via KV)
    let slug = resolveAppSlug(c.req.raw);
    if (!slug) {
      const resolved = await resolveHostFull(c.req.raw, c.env);
      if (!resolved) {
        return c.json(
          {
            error: 'unknown_host',
            message:
              'This Shippie Worker only serves *.shippie.app (prod) or *.localhost (dev), plus verified custom domains.',
            host: c.req.header('host') ?? null,
          },
          400,
        );
      }
      slug = resolved.slug;

      // Canonical redirect: if this custom domain is non-canonical,
      // 301 to the canonical domain to prevent duplicate content.
      if (!resolved.isCanonical && resolved.canonicalDomain) {
        const url = new URL(c.req.url);
        url.hostname = resolved.canonicalDomain;
        return c.redirect(url.toString(), 301);
      }
    }
    c.set('slug', slug);
    await next();

    // Per-app CSP from KV (written by deploy trust pipeline). Falls back
    // to a restrictive default for apps deployed before CSP-to-KV shipped.
    // The per-app CSP includes allowed_connect_domains so BYO backend
    // requests (Supabase, Firebase) are not blocked.
    const res = c.res;
    if (!res.headers.has('content-security-policy')) {
      const appCsp = await c.env.APP_CONFIG.get(`apps:${slug}:csp`);
      res.headers.set(
        'content-security-policy',
        appCsp ?? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      );
    }
    res.headers.set('x-content-type-options', 'nosniff');
    res.headers.set('x-frame-options', 'DENY');
    res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  });

  // ------------------------------------------------------------------
  // System routes (__shippie/*) — owned by the platform, never by the maker
  // ------------------------------------------------------------------
  app.route('/__shippie', systemRouter);

  // ------------------------------------------------------------------
  // Maker files — catches everything else and serves from R2
  // ------------------------------------------------------------------
  app.route('/', filesRouter);

  return app;
}
