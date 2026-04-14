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
import { resolveAppSlug } from './routing.ts';
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
    const slug = resolveAppSlug(c.req.raw);
    if (!slug) {
      // Unknown host — refuse clearly instead of 404ing.
      return c.json(
        {
          error: 'unknown_host',
          message:
            'This Shippie Worker only serves *.shippie.app (prod) or *.localhost (dev).',
          host: c.req.header('host') ?? null,
        },
        400,
      );
    }
    c.set('slug', slug);
    await next();
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
