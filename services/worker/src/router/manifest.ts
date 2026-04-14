/**
 * __shippie/manifest
 *
 * Generated PWA manifest.json from the app's stored metadata. Spec v6 §9.
 * When no app config exists, returns a minimal valid manifest so the page
 * still installs cleanly.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

export const manifestRouter = new Hono<AppBindings>();

manifestRouter.get('/', async (c) => {
  const slug = c.var.slug;
  const meta = await c.env.APP_CONFIG.getJson<{
    name?: string;
    theme_color?: string;
    background_color?: string;
  }>(`apps:${slug}:meta`);

  const manifest = {
    name: meta?.name ?? slug,
    short_name: meta?.name ?? slug,
    description: `Built with Shippie.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: meta?.theme_color ?? '#f97316',
    background_color: meta?.background_color ?? '#ffffff',
    icons: [
      { src: '/__shippie/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/__shippie/icons/512.png', sizes: '512x512', type: 'image/png' },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
