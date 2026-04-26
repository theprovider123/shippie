import type { RequestHandler } from './$types';
import { handleLocalScript } from '$server/wrapper/router/local';

export const GET: RequestHandler = async ({ request, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleLocalScript({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
};
