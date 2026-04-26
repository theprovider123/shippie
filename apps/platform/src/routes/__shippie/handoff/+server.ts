import type { RequestHandler } from './$types';
import { handleHandoff } from '$server/wrapper/router/handoff';

export const POST: RequestHandler = async ({ request, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleHandoff({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
};
