/**
 * Structured logger for route handlers.
 *
 * This is a lightweight wrapper: in dev it writes tagged lines to
 * stdout; in prod it'll swap for Sentry + OpenTelemetry without
 * touching route handlers.
 *
 * Usage:
 *   export const POST = withLogger('oauth.token', async (req) => {
 *     // ... handler
 *   });
 *
 * The wrapper logs (method, path, status, duration_ms) on every call
 * and catches unhandled errors so they surface as 500s with a request
 * id the caller can correlate.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';

type Handler<C = unknown> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

export function withLogger<C = unknown>(name: string, handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const requestId = randomBytes(8).toString('hex');
    const started = Date.now();
    const url = new URL(req.url);
    let status = 500;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      // Log the full error to stderr — in prod this goes to Sentry.
      console.error(
        JSON.stringify({
          level: 'error',
          route: name,
          method: req.method,
          path: url.pathname,
          request_id: requestId,
          error: msg,
          stack,
        }),
      );
      return NextResponse.json(
        { error: 'internal_error', request_id: requestId },
        { status: 500, headers: { 'x-request-id': requestId } },
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
          request_id: requestId,
        }),
      );
    }
  };
}
