import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  listSealedSnapshots,
  parseSealedSnapshotRequest,
  storeSealedSnapshot,
} from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireDocumentId(params.documentId);
  try {
    const result = await listSealedSnapshots(platform.env, documentId, {
      cursor: url.searchParams.get('cursor'),
      limit: Number(url.searchParams.get('limit') ?? '20'),
      latest: url.searchParams.get('latest') === '1',
    });
    return json(result, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    throw error(statusFor(err), messageFor(err));
  }
};

export const POST: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireDocumentId(params.documentId);
  try {
    const snapshot = await parseSealedSnapshotRequest(request);
    const result = await storeSealedSnapshot(platform.env, documentId, snapshot, { request });
    return json(result, {
      status: result.stored ? 201 : 200,
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    throw error(statusFor(err), messageFor(err));
  }
};

function statusFor(err: unknown): number {
  const message = messageFor(err);
  if (message.includes('unavailable')) return 503;
  if (message.includes('budget')) return 429;
  if (message.includes('large')) return 413;
  return 400;
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : 'invalid sealed snapshot request';
}

function requireDocumentId(value: string | undefined): string {
  if (!value) throw error(400, 'missing document id');
  return value;
}
