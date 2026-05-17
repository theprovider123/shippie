import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  hasSealedDocumentChanged,
  readSealedDocumentChangeHint,
} from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireDocumentId(params.documentId);
  try {
    const hint = await readSealedDocumentChangeHint(platform.env, documentId);
    const changed = hasSealedDocumentChanged(hint, {
      eventCursor: url.searchParams.get('eventCursor'),
      snapshotCursor: url.searchParams.get('snapshotCursor'),
      eventCount: readCount(url.searchParams.get('eventCount')),
      snapshotCount: readCount(url.searchParams.get('snapshotCount')),
    });
    return json({ ...hint, changed }, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : 'invalid document hint request');
  }
};

function requireDocumentId(value: string | undefined): string {
  if (!value) throw error(400, 'missing document id');
  return value;
}

function readCount(value: string | null): number | null {
  if (value === null || value === '') return null;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) throw error(400, 'invalid document count');
  return Math.floor(count);
}
