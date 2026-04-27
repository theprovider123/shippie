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
    id: '/?app=shippie',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    theme_color: '#14120F',
    background_color: '#F5EFE4',
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    categories: ['productivity'],
    icons: [
      { src: '/__shippie-pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/__shippie-pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/__shippie-pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Explore apps', url: '/apps', short_name: 'Explore' },
      { name: 'Deploy an app', url: '/new', short_name: 'Deploy' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
