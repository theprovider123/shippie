import { error, type RequestHandler } from '@sveltejs/kit';
import {
  hasSealedDocumentChanged,
  readSealedDocumentChangeHint,
  sealedChangeStreamEnabled,
} from '$lib/server/documents/sealed-cloud';

const encoder = new TextEncoder();
const MAX_STREAM_MS = 55_000;
const DEFAULT_STREAM_MS = 45_000;
const MIN_INTERVAL_MS = 750;
const DEFAULT_INTERVAL_MS = 1_000;

export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform?.env) throw error(503, 'document storage unavailable');
  if (!sealedChangeStreamEnabled(platform.env)) throw error(404, 'document change stream unavailable');
  const documentId = requireDocumentId(params.documentId);
  const baseline = {
    eventCursor: url.searchParams.get('eventCursor'),
    snapshotCursor: url.searchParams.get('snapshotCursor'),
    eventCount: readCount(url.searchParams.get('eventCount')),
    snapshotCount: readCount(url.searchParams.get('snapshotCount')),
  };
  const timeoutMs = clamp(readCount(url.searchParams.get('timeoutMs')) ?? DEFAULT_STREAM_MS, MIN_INTERVAL_MS, MAX_STREAM_MS);
  const intervalMs = clamp(readCount(url.searchParams.get('intervalMs')) ?? DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, 10_000);

  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let closed = false;
      const deadline = Date.now() + timeoutMs;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      send('ready', { schema: 'shippie.document.change-stream.v1', documentId, timeoutMs, intervalMs });

      while (!closed && Date.now() < deadline) {
        try {
          const hint = await readSealedDocumentChangeHint(platform.env, documentId);
          const changed = hasSealedDocumentChanged(hint, baseline);
          if (changed) {
            send('change', { ...hint, changed });
            close();
            return;
          }
          send('keepalive', { documentId, updatedAt: hint.updatedAt });
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : 'document change stream failed' });
          close();
          return;
        }
        await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      }
      send('timeout', { documentId });
      close();
    },
    cancel() {
      // The browser closed the EventSource; no server cleanup is needed.
    },
  }), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  });
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
