import type { RequestHandler } from './$types';
import { handleIcon } from '$server/wrapper/router/icons';

export const GET: RequestHandler = async ({ request, params, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleIcon(
    { request, env: platform.env, slug, traceId: crypto.randomUUID() },
    params.size
  );
};
