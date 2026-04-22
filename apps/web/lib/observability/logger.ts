/**
 * Structured logger for route handlers.
 *
 * Lightweight wrapper: dev writes tagged lines to stdout; prod will swap
 * in Sentry + OpenTelemetry without touching route handlers.
 *
 * Every request carries a trace id under `x-shippie-trace-id`. If the
 * caller (e.g. the Cloudflare Worker proxying a signed request) already
 * supplied one, we honor it so both planes' logs correlate. Otherwise
 * we mint one. The id is echoed back on the response and appears in
 * every log line under `trace_id`.
 *
 * Usage:
 *   export const POST = withLogger('oauth.token', async (req) => {
 *     // ... handler
 *   });
 */
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';

export const TRACE_ID_HEADER = 'x-shippie-trace-id';

function mintTraceId(): string {
  return randomBytes(8).toString('hex');
}

function resolveTraceId(req: NextRequest): string {
  const header = req.headers.get(TRACE_ID_HEADER);
  if (header && /^[a-zA-Z0-9-]{1,64}$/.test(header)) return header;
  return mintTraceId();
}

type Handler<C = unknown> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

export function withLogger<C = unknown>(name: string, handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const traceId = resolveTraceId(req);
    const started = Date.now();
    const url = new URL(req.url);
    let status = 500;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      if (!res.headers.has(TRACE_ID_HEADER)) {
        res.headers.set(TRACE_ID_HEADER, traceId);
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(
        JSON.stringify({
          level: 'error',
          route: name,
          method: req.method,
          path: url.pathname,
          trace_id: traceId,
          error: msg,
          stack,
        }),
      );
      return NextResponse.json(
        { error: 'internal_error', trace_id: traceId },
        { status: 500, headers: { [TRACE_ID_HEADER]: traceId } },
      );
    } finally {
      const durationMs = Date.now() - started;
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      console.log(
        JSON.stringify({
          level,
          route: name,
          method: req.method,
          path: url.pathname,
          status,
          duration_ms: durationMs,
          trace_id: traceId,
        }),
      );
    }
  };
}
