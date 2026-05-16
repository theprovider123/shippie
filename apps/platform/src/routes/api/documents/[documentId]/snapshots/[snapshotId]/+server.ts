import { error, json, type RequestHandler } from '@sveltejs/kit';
import { listSealedSnapshots } from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireParam(params.documentId, 'missing document id');
  const snapshotId = requireParam(params.snapshotId, 'missing snapshot id');
  try {
    const result = await listSealedSnapshots(platform.env, documentId, { limit: 100 });
    const snapshot = result.snapshots.find((item) => item.snapshotId === snapshotId);
    if (!snapshot) throw error(404, 'snapshot not found');
    return json(snapshot, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    if (isHttpError(err)) throw err;
    throw error(statusFor(err), messageFor(err));
  }
};

function requireParam(value: string | undefined, message: string): string {
  if (!value) throw error(400, message);
  return value;
}

function isHttpError(err: unknown): err is { status: number; body?: unknown } {
  return typeof err === 'object' && err !== null && 'status' in err;
}

function statusFor(err: unknown): number {
  const message = messageFor(err);
  if (message.includes('unavailable')) return 503;
  if (message.includes('not found')) return 404;
  return 400;
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : 'invalid sealed snapshot request';
}
