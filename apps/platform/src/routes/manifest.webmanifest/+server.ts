/**
 * GET /manifest.webmanifest
 *
 * Phase 9.1 — the marketplace itself is an installable PWA. Practising
 * the ethos: shippie.app browses, installs, and works offline using the
 * same mechanics every maker app does.
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
    description: 'Open marketplace for installable web apps. No app store. Just the web, installed.',
    id: '/container',
    start_url: '/container',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    theme_color: '#14120F',
    background_color: '#F5EFE4',
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    categories: ['productivity'],
    icons: [
      { src: '/__shippie-pwa/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Open Shippie', url: '/container', short_name: 'Home' },
      { name: 'Explore apps', url: '/apps', short_name: 'Explore' },
      { name: 'Deploy an app', url: '/new', short_name: 'Deploy' },
    ],
    file_handlers: [
      {
        action: '/container?import=package',
        accept: {
          'application/vnd.shippie.package': ['.shippie'],
          'application/json': ['.json'],
        },
      },
    ],
    protocol_handlers: [{ protocol: 'web+shippie', url: '/container?open=%s' }],
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
