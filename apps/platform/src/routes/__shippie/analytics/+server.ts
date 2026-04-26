import type { RequestHandler } from './$types';
import { handleAnalytics } from '$server/wrapper/router/analytics';

export const POST: RequestHandler = async ({ request, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleAnalytics({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
};
