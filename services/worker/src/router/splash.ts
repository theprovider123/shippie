/**
 * __shippie/splash/:device.png
 *
 * Serves iOS splash-screen images (per-device). Looks up
 * `splash/<slug>/<device>.png` in SHIPPIE_PUBLIC first, then falls back
 * to `splash/default/<device>.png`, then 404s.
 *
 * Spec §9.1.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { toResponseBody } from '../bytes.ts';

export const splashRouter = new Hono<AppBindings>();

splashRouter.get('/:device{[a-z0-9-]+\\.png}', async (c) => {
  const slug = c.var.slug;
  const device = c.req.param('device');
  const appSpecific = await c.env.SHIPPIE_PUBLIC.get(`splash/${slug}/${device}`);
  if (appSpecific) {
    return new Response(toResponseBody(await appSpecific.body()), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
    });
  }
  const fallback = await c.env.SHIPPIE_PUBLIC.get(`splash/default/${device}`);
  if (fallback) {
    return new Response(toResponseBody(await fallback.body()), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  return new Response('Not found', { status: 404 });
});
