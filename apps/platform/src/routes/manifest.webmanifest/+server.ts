/**
 * GET /manifest.webmanifest
 *
 * Phase 9.1 — the marketplace itself can run from a home-screen icon.
 * Practising the ethos: shippie.app browses, opens, and works offline
 * using the same mechanics every maker app does.
 *
 * Only served on root platform hostnames (shippie.app, www.shippie.app,
 * next.shippie.app). Maker subdomains pass through to the wrapper
 * dispatcher and never reach this route — but we early-return defensively
 * to avoid serving a marketplace manifest from a maker subdomain.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PLATFORM_HOSTS = new Set([
  '127.0.0.1',
  '::1',
  'next.shippie.app',
  'shippie.app',
  'www.shippie.app',
  'localhost',
]);

export const GET: RequestHandler = async ({ url }) => {
  if (!PLATFORM_HOSTS.has(url.hostname) && url.hostname !== 'shippie.app') {
    throw error(404, 'not found');
  }

  const manifest = {
    name: 'Shippie',
    short_name: 'Shippie',
    description: 'Small tools that work on your device.',
    id: '/',
    start_url: '/dock',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    theme_color: '#14120F',
    background_color: '#14120F',
    handle_links: 'preferred',
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    categories: ['productivity'],
    icons: [
      { src: '/__shippie-pwa/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Open Dock', url: '/dock', short_name: 'Dock' },
      { name: 'Browse tools', url: '/tools', short_name: 'Tools' },
      { name: 'You', url: '/you', short_name: 'You' },
      { name: 'Ship app', url: '/new', short_name: 'Ship' },
    ],
    file_handlers: [
      {
        action: '/dock?import=package',
        accept: {
          'application/vnd.shippie.package': ['.shippie'],
          'application/json': ['.json'],
        },
      },
    ],
    url_handlers: [
      { origin: 'https://shippie.app' },
      { origin: 'https://www.shippie.app' },
    ],
    protocol_handlers: [{ protocol: 'web+shippie', url: '/dock?open=%s' }],
    prefer_related_applications: false,
    screenshots: [
      { src: '/__shippie-pwa/screenshot-narrow.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Shippie Dock — saved tools, offline-ready' },
      { src: '/__shippie-pwa/screenshot-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Shippie Tools — browse and save' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // Short TTL so the OS picks up new builds quickly. The wrapper SW
      // handles in-app "new version available" notifications; this is the
      // belt-and-braces layer for cold reopens after the SW has churned.
      'cache-control': 'public, max-age=60',
    },
  });
};
