/**
 * Proximity Protocol signalling endpoint.
 *
 * Routed at `/__shippie/signal/[roomId]` on the platform Worker. Maker
 * apps connect via `wss://shippie.app/__shippie/signal/<roomId>` (or via
 * `proximity.shippie.app` once that subdomain is live).
 *
 * The route's job:
 *   1. Validate the WebSocket upgrade.
 *   2. Look up a SignalRoom Durable Object instance keyed by `[roomId]`.
 *   3. Forward the request to the DO so per-room state (peer registry,
 *      message fan-out) is handled by the runtime.
 *
 * The roomId is opaque here — the proximity client computes it as
 * `sha256(public_ip + app_slug + group_code)` so peers on the same
 * network sharing the same join code converge on the same DO.
 */
import { error as kitError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface SignalEnv {
  SIGNAL_ROOM?: {
    idFromName(name: string): { toString(): string };
    get(id: { toString(): string }): { fetch: (req: Request) => Promise<Response> };
  };
}

export const GET: RequestHandler = async ({ params, request, platform }) => {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    throw kitError(400, 'Expected WebSocket upgrade.');
  }

  const env = (platform?.env ?? {}) as SignalEnv;
  if (!env.SIGNAL_ROOM) {
    throw kitError(503, 'Proximity signalling not configured.');
  }

  const roomId = params.roomId ?? '';
  if (roomId.length === 0 || roomId.length > 256) {
    throw kitError(400, 'Invalid roomId.');
  }

  const id = env.SIGNAL_ROOM.idFromName(roomId);
  const stub = env.SIGNAL_ROOM.get(id);
  return await stub.fetch(request);
};
