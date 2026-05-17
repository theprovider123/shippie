import { error, type RequestHandler } from '@sveltejs/kit';
import {
  readSealedAttachment,
  storeSealedAttachment,
} from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireParam(params.documentId, 'missing document id');
  const attachmentId = requireParam(params.attachmentId, 'missing attachment id');
  try {
    return await readSealedAttachment(platform.env, documentId, attachmentId);
  } catch (err) {
    throw error(statusFor(err), messageFor(err));
  }
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireParam(params.documentId, 'missing document id');
  const attachmentId = requireParam(params.attachmentId, 'missing attachment id');
  try {
    const result = await storeSealedAttachment(platform.env, documentId, attachmentId, request);
    return Response.json(result, {
      status: result.stored ? 201 : 200,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    throw error(statusFor(err), messageFor(err));
  }
};

function requireParam(value: string | undefined, message: string): string {
  if (!value) throw error(400, message);
  return value;
}

function statusFor(err: unknown): number {
  const message = messageFor(err);
  if (message.includes('unavailable')) return 503;
  if (message.includes('not found')) return 404;
  if (message.includes('budget')) return 429;
  if (message.includes('large')) return 413;
  return 400;
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : 'invalid sealed attachment request';
}
