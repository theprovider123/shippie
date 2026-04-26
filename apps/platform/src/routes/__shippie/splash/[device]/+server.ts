import type { RequestHandler } from './$types';
import { handleSplash } from '$server/wrapper/router/splash';

export const GET: RequestHandler = async ({ request, params, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleSplash(
    { request, env: platform.env, slug, traceId: crypto.randomUUID() },
    params.device
  );
};
