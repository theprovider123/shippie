import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  listSealedEvents,
  parseSealedEventBatchRequest,
  storeSealedEventBatch,
} from '$lib/server/documents/sealed-cloud';

export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  const documentId = requireDocumentId(params.documentId);
  try {
    const result = await listSealedEvents(platform.env, documentId, {
      cursor: url.searchParams.get('cursor'),
      limit: Number(url.searchParams.get('limit') ?? '50'),
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
    const { events, batch } = await parseSealedEventBatchRequest(request);
    const result = await storeSealedEventBatch(platform.env, documentId, events, {
      request,
      waitUntil: requestWaitUntil(platform),
    });
    return json(batch ? result : result.events[0], {
      status: result.stored > 0 ? 201 : 200,
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
  return err instanceof Error ? err.message : 'invalid sealed document request';
}

function requireDocumentId(value: string | undefined): string {
  if (!value) throw error(400, 'missing document id');
  return value;
}

function requestWaitUntil(platform: App.Platform | undefined): ((promise: Promise<unknown>) => void) | undefined {
  const workerPlatform = platform as (App.Platform & {
    context?: ExecutionContext;
    ctx?: ExecutionContext;
  }) | undefined;
  const context = workerPlatform?.ctx ?? workerPlatform?.context;
  return context?.waitUntil?.bind(context);
}
