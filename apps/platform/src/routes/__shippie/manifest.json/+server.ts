/**
 * Platform-host fallback for /__shippie/manifest.json.
 *
 * The wrapper dispatcher in hooks.server.ts handles maker subdomains
 * directly. This route only fires when the platform host (shippie.app)
 * receives a manifest request — useful for SDK clients that probe
 * the canonical manifest URL during install funnels.
 *
 * Requires `?slug=<app>` to identify which app's manifest to render.
 */
import type { RequestHandler } from './$types';
import { handleManifest } from '$server/wrapper/router/manifest';

export const GET: RequestHandler = async ({ request, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleManifest({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
};
