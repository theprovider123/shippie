/**
 * Deploy event stream consumer — Phase 3.
 *
 * Reads SSE from /api/deploy/{deployId}/stream and emits typed events.
 * The platform writes one SSE frame per deploy event from the
 * events.ndjson artifact.
 *
 * Both the MCP and the future CLI use this to render live deploy
 * progress without re-implementing SSE parsing.
 */

export interface StreamEvent {
  /** Event type from `event:` line. Maps to DeployEvent['type'] when
   *  that union is in scope. Free string keeps this lib decoupled. */
  type: string;
  /** Parsed JSON from `data:` line. Empty object on parse failure. */
  data: Record<string, unknown>;
}

export interface StreamOptions {
  /** Override fetch — primarily for tests. */
  fetchImpl?: typeof fetch;
  /** Replay delay in ms (server-side). 0 = instant. Cap 200. */
  replayDelayMs?: number;
  /** Abort signal so the consumer can stop early. */
  signal?: AbortSignal;
}

interface InternalCtx {
  apiUrl: string;
}

/**
 * Open the deploy stream. Yields one event at a time.
 *
 * The async generator pattern is the cleanest fit for SSE: callers can
 * `for await (const event of streamDeploy(client, id))` and process
 * events synchronously while waiting on the next.
 */
export async function* streamDeploy(
  ctx: InternalCtx,
  deployId: string,
  opts: StreamOptions = {},
): AsyncGenerator<StreamEvent, void, void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  if (typeof opts.replayDelayMs === 'number') {
    params.set('replayDelayMs', String(Math.max(0, Math.min(200, opts.replayDelayMs))));
  }
  const qs = params.toString();
  const url = `${ctx.apiUrl}/api/deploy/${encodeURIComponent(deployId)}/stream${qs ? '?' + qs : ''}`;

  const res = await fetchImpl(url, {
    headers: { accept: 'text/event-stream' },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream_request_failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  // SSE frame parsing: events are separated by blank lines. Each event
  // can have multiple `event:` and `data:` lines (last one wins for
  // event:, data: lines concatenate).
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = parseFrame(frame);
      if (event) yield event;
    }
  }
  // Drain any trailing partial frame.
  if (buffer.trim().length > 0) {
    const event = parseFrame(buffer);
    if (event) yield event;
  }
}

function parseFrame(frame: string): StreamEvent | null {
  const lines = frame.split('\n');
  let type = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
  } catch {
    /* parse-failed events still surface, with empty data, so consumers can see them */
  }
  return { type, data };
}
