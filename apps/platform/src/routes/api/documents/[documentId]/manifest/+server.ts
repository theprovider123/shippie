import { error, json, type RequestHandler } from '@sveltejs/kit';
import { readSealedDocumentManifest } from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireDocumentId(params.documentId);
  try {
    return json(await readSealedDocumentManifest(platform.env, documentId), {
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : 'invalid document manifest request');
  }
};

function requireDocumentId(value: string | undefined): string {
  if (!value) throw error(400, 'missing document id');
  return value;
}
