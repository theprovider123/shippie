/**
 * /__shippie/splash/{device}.png — iOS splash screens.
 * Ported from services/worker/src/router/splash.ts.
 */
import type { WrapperContext } from '../env';
import { toResponseBody } from '../bytes';

export async function handleSplash(
  ctx: WrapperContext,
  device: string
): Promise<Response> {
  if (!/^[a-z0-9-]+\.png$/.test(device)) {
    return new Response('Invalid device', { status: 400 });
  }
  const appSpecific = await ctx.env.PLATFORM_ASSETS.get(`splash/${ctx.slug}/${device}`);
  if (appSpecific) {
    const bytes = new Uint8Array(await appSpecific.arrayBuffer());
    return new Response(toResponseBody(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800'
      }
    });
  }
  const fallback = await ctx.env.PLATFORM_ASSETS.get(`splash/default/${device}`);
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
  return new Response('Not found', { status: 404 });
}
