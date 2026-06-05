import type { RequestHandler } from './$types';
import { handleFeedback } from '$server/wrapper/router/feedback';

export const POST: RequestHandler = async ({ request, url, platform, locals }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handleFeedback({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID(),
    // First-party same-origin submits (the Dock) carry a Lucia session so the
    // feedback links to the user's account; anonymous/cross-origin stays null.
    userId: locals.user?.id ?? null
  });
};
