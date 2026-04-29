/**
 * GET /api/deploy/[id]/stream
 *
 * Server-Sent Events endpoint for the Phase 3 deploy stream.
 *
 * Phase 3.1 cut: replays the static `events.ndjson` artifact written by
 * the deploy pipeline. Each line in the NDJSON becomes one SSE `data:`
 * frame, separated by short delays so the consumer can render the deploy
 * timeline as it would have looked live.
 *
 * Phase 9 (Hub) and the future async-pipeline cut will tail an
 * actively-growing NDJSON object — at that point this handler can switch
 * from "read-once-replay" to "watch-and-emit-as-new-lines-arrive". The
 * SSE shape stays the same, so all consumers continue to work.
 *
 * Auth: same posture as `/status` — public read of a maker's own deploy
 * id is fine because the id itself is unguessable. We may scope this to
 * the maker's session in a later pass; deploy ids are sufficiently
 * opaque that exposing them is low-risk.
 *
 * Replay accepts `?replayDelayMs=` (capped 0..200) so tests can ask for
 * an instant flush. Default 30ms gives a "live" feel without dragging.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deployEventsKey } from '$server/deploy/deploy-events';

const REPLAY_DELAY_DEFAULT_MS = 30;
const REPLAY_DELAY_MAX_MS = 200;

interface DeployRow {
  id: string;
  slug: string;
  version: number;
}

export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform?.env.DB) throw error(500, 'database unavailable');
  if (!platform?.env.APPS) throw error(500, 'apps bucket unavailable');

  const row = await platform.env.DB
    .prepare(
      `SELECT d.id, a.slug, d.version FROM deploys d
       JOIN apps a ON a.id = d.app_id
       WHERE d.id = ? LIMIT 1`,
    )
    .bind(params.id)
    .first<DeployRow>();

  if (!row) throw error(404, 'deploy not found');

  const replayDelayParam = Number(url.searchParams.get('replayDelayMs') ?? '');
  const replayDelayMs = Number.isFinite(replayDelayParam)
    ? Math.max(0, Math.min(REPLAY_DELAY_MAX_MS, replayDelayParam))
    : REPLAY_DELAY_DEFAULT_MS;

  const key = deployEventsKey(row.slug, row.version);
  const obj = await platform.env.APPS.get(key);
  if (!obj) {
    // No artifact yet (legacy deploy or in-flight). Emit a single
    // "pending" SSE frame so the consumer doesn't hang.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(
          enc.encode(
            `event: pending\ndata: ${JSON.stringify({ deploy_id: row.id, message: 'no events yet' })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, { headers: sseHeaders() });
  }

  const text = await obj.text();
  const lines = text.split('\n').filter((l) => l.length > 0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(
        enc.encode(
          `event: ready\ndata: ${JSON.stringify({ deploy_id: row.id, slug: row.slug, version: row.version, eventCount: lines.length })}\n\n`,
        ),
      );
      for (const line of lines) {
        let parsed: { type?: string };
        try {
          parsed = JSON.parse(line) as { type?: string };
        } catch {
          continue;
        }
        const eventType = typeof parsed.type === 'string' ? parsed.type : 'message';
        controller.enqueue(enc.encode(`event: ${eventType}\ndata: ${line}\n\n`));
        if (replayDelayMs > 0) {
          await sleep(replayDelayMs);
        }
      }
      controller.enqueue(enc.encode(`event: end\ndata: {}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
};

function sseHeaders(): Headers {
  const h = new Headers();
  h.set('Content-Type', 'text/event-stream; charset=utf-8');
  h.set('Cache-Control', 'no-cache, no-transform');
  // Helps proxies that buffer SSE.
  h.set('X-Accel-Buffering', 'no');
  return h;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
