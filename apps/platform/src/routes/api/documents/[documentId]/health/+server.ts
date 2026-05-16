import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  readSealedDocumentBudgetHealth,
  readSealedDocumentHealth,
} from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireDocumentId(params.documentId);
  try {
    const [health, budget] = await Promise.all([
      readSealedDocumentHealth(platform.env, documentId),
      readSealedDocumentBudgetHealth(platform.env, documentId),
    ]);
    return json(
      {
        ...(isObject(health) ? health : { documentId, lastEventId: null, lastSyncedAt: null }),
        budget,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : 'invalid document id');
  }
};

function requireDocumentId(value: string | undefined): string {
  if (!value) throw error(400, 'missing document id');
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
