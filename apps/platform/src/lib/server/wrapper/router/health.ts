/**
 * /__shippie/health — wrapper-side healthcheck.
 *
 * Distinct from the platform-host healthcheck at
 * routes/__shippie/health/+server.ts (which probes bindings). This
 * version returns the simpler shape that maker subdomains have always
 * exposed, for SDK clients that hit `<slug>.shippie.app/__shippie/health`.
 */
import type { WrapperContext } from '../env';

export function handleHealth(ctx: WrapperContext): Response {
  return Response.json({
    ok: true,
    service: 'shippie-platform',
    env: ctx.env.SHIPPIE_ENV,
    slug: ctx.slug,
    timestamp: new Date().toISOString()
  });
}
