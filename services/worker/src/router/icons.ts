/**
 * __shippie/icons/{size}.png
 *
 * Serves resized app icons from the public assets bucket. Requested sizes:
 * 48, 72, 96, 144, 152, 180, 192, 256, 384, 512, 1024 (spec v6 §9.1).
 *
 * On cache miss or unknown app, returns a placeholder Shippie icon.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { toResponseBody } from '../bytes.ts';

export const iconsRouter = new Hono<AppBindings>();

// 1x1 transparent PNG placeholder (smallest valid PNG, 67 bytes)
const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

iconsRouter.get('/:size{[0-9]+\\.png}', async (c) => {
  const slug = c.var.slug;
  const sizeParam = c.req.param('size');
  // Strip .png extension
  const size = sizeParam.replace(/\.png$/, '');

  // Try the app's specific icon first
  const appIcon = await c.env.SHIPPIE_PUBLIC.get(`icons/${slug}/${size}.png`);
  if (appIcon) {
    return new Response(toResponseBody(await appIcon.body()), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800',
      },
    });
  }

  // Fallback to the platform default
  const fallback = await c.env.SHIPPIE_PUBLIC.get(`icons/default/${size}.png`);
  if (fallback) {
    return new Response(toResponseBody(await fallback.body()), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Last-resort placeholder
  return new Response(toResponseBody(base64ToBytes(PLACEHOLDER_PNG_BASE64)), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=60',
    },
  });
});
