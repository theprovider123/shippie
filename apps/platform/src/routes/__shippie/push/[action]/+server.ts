import type { RequestHandler } from './$types';
import {
  handlePushSubscribe,
  handlePushUnsubscribe,
  handlePushVapidKey
} from '$server/wrapper/router/push';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  if (params.action !== 'vapid-key') throw error(404, 'Not found');
  const slug = url.searchParams.get('slug') ?? '_platform_';
  return handlePushVapidKey({
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  });
};

export const POST: RequestHandler = async ({ request, params, url, platform }) => {
  if (!platform?.env) return new Response('No platform', { status: 503 });
  const slug = url.searchParams.get('slug') ?? '_platform_';
  const ctx = {
    request,
    env: platform.env,
    slug,
    traceId: crypto.randomUUID()
  };
  if (params.action === 'subscribe') return handlePushSubscribe(ctx);
  if (params.action === 'unsubscribe') return handlePushUnsubscribe(ctx);
  throw error(404, 'Not found');
};
