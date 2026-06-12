import type { RequestHandler } from './$types';
import { buildAppCardSvg, loadAppShareMeta } from '$server/og/app-card';

export const GET: RequestHandler = async (event) => {
  const meta = await loadAppShareMeta(event);
  if (!meta) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  }

  return new Response(buildAppCardSvg(meta, event.url.origin), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
    },
  });
};
