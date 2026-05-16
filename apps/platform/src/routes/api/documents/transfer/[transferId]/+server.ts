import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  parseWrappedAccessBundleRequest,
  readWrappedAccessBundle,
  storeWrappedAccessBundle,
} from '$lib/server/documents/access-transfer';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env) throw error(503, 'access transfer relay unavailable');
  const transferId = requireTransferId(params.transferId);
  try {
    const bundle = await readWrappedAccessBundle(platform.env, transferId);
    if (!bundle) throw error(404, 'wrapped access bundle not found');
    return json(bundle, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (isSvelteError(err)) throw err;
    throw error(statusFor(err), messageFor(err));
  }
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env) throw error(503, 'access transfer relay unavailable');
  const transferId = requireTransferId(params.transferId);
  try {
    const bundle = await parseWrappedAccessBundleRequest(request);
    const result = await storeWrappedAccessBundle(platform.env, transferId, bundle);
    return json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    throw error(statusFor(err), messageFor(err));
  }
};

function requireTransferId(value: string | undefined): string {
  if (!value) throw error(400, 'missing transfer id');
  return value;
}

function statusFor(err: unknown): number {
  const message = messageFor(err);
  if (message.includes('unavailable')) return 503;
  if (message.includes('large')) return 413;
  return 400;
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : 'invalid access transfer request';
}

function isSvelteError(err: unknown): err is { status: number; body?: unknown } {
  return typeof err === 'object' && err !== null && 'status' in err;
}
