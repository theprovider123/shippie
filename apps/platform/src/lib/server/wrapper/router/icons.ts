/**
 * /__shippie/icons/{size}.png — per-app icons + platform fallback.
 * Ported from services/worker/src/router/icons.ts.
 */
import type { WrapperContext } from '../env';
import { toResponseBody } from '../bytes';

const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function handleIcon(
  ctx: WrapperContext,
  sizeParam: string
): Promise<Response> {
  // Strip .png — accept "192" or "192.png".
  const size = sizeParam.replace(/\.png$/, '');
  if (!/^\d+$/.test(size)) {
    return new Response('Invalid size', { status: 400 });
  }

  const appIcon = await ctx.env.PLATFORM_ASSETS.get(`icons/${ctx.slug}/${size}.png`);
  if (appIcon) {
    const bytes = new Uint8Array(await appIcon.arrayBuffer());
    return new Response(toResponseBody(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800'
      }
    });
  }

  const fallback = await ctx.env.PLATFORM_ASSETS.get(`icons/default/${size}.png`);
  if (fallback) {
    const bytes = new Uint8Array(await fallback.arrayBuffer());
    return new Response(toResponseBody(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }

  return new Response(toResponseBody(base64ToBytes(PLACEHOLDER_PNG_BASE64)), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=60'
    }
  });
}
