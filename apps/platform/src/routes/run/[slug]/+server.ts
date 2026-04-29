/**
 * `/run/<slug>/` — focused-mode entry for the unified container.
 *
 * The unification plan's single canonical app URL. The marketplace
 * "Open" button targets this route. So does the
 * <slug>.shippie.app subdomain redirect (in hooks.server.ts). So
 * does the focused-PWA `start_url` once the per-app PWA work lands.
 *
 * Today this 302s to `/container?app=<slug>&focused=1`. The
 * container page reads `focused=1` and renders without the topbar /
 * sidebar / bottom tabs — full-bleed app, invisible chrome. The
 * canonical-URL stays `/run/<slug>/` for the user; the redirect is
 * the implementation seam between the URL pattern and the existing
 * orchestrator shell at /container.
 *
 * First-party showcases ALSO have static dist files at
 * `apps/platform/static/run/<slug>/` (built by
 * `scripts/prepare-showcases.mjs`). SvelteKit's static handler
 * resolves those before this dynamic route runs, so static files
 * for first-party showcases continue to serve directly. This route
 * only fires for slugs that DON'T have static files — i.e., maker
 * apps and any showcase that hasn't been pre-built.
 *
 * Why a redirect rather than rendering inline:
 *   - The container shell at /container already owns the
 *     orchestrator state (intent registry, transfer registry, mesh
 *     client, texture engine, AI worker, agent insights, host map,
 *     frame map). Duplicating that into a sibling route would
 *     double the surface area without adding behaviour.
 *   - The focused-mode rendering is a query-driven branch inside
 *     the same shell, not a separate page. One canonical container
 *     page; two render modes.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
  const slug = params.slug;
  if (!slug) throw redirect(302, '/');
  const target = new URL('/container', url);
  target.searchParams.set('app', slug);
  target.searchParams.set('focused', '1');
  // Preserve any query a deep-link carried (e.g., `?recipe=stir-fry`).
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'app' || k === 'focused') continue;
    target.searchParams.set(k, v);
  }
  throw redirect(302, target.pathname + target.search);
};
