/**
 * /__shippie/signal/<roomId> — Proximity Protocol WebSocket signalling.
 *
 * The route validates the upgrade, derives the DO id from `:roomId`,
 * and proxies the Request straight into the SignalRoom DO. The DO
 * handles the WebSocket upgrade and all per-room fan-out logic.
 *
 * In dev (Bun) we don't have CF DO bindings, so the route delegates to
 * a per-process in-memory router. The wire protocol is identical so
 * the proximity client doesn't branch on environment.
 *
 * See:
 *   - services/worker/src/signal-room.ts (DO class — prod)
 *   - packages/proximity/src/* (client)
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import { devSignalHandler } from './signal-dev.ts';

export const signalRouter = new Hono<AppBindings>();

interface SignalEnv extends WorkerEnv {
  SIGNAL_ROOM?: {
    idFromName(name: string): { toString(): string };
    get(id: { toString(): string } | unknown): {
      fetch(req: Request): Promise<Response>;
    };
  };
}

const ROOM_ID_RE = /^[a-f0-9]{16,128}$/;

signalRouter.get('/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  if (!roomId || !ROOM_ID_RE.test(roomId)) {
    return c.json({ error: 'invalid_room' }, 400);
  }

  const upgrade = c.req.header('upgrade')?.toLowerCase();
  if (upgrade !== 'websocket') {
    return c.json({ error: 'expected_websocket_upgrade' }, 426);
  }

  const env = c.env as SignalEnv;

  // Production: route to the SignalRoom DO.
  if (env.SIGNAL_ROOM) {
    const id = env.SIGNAL_ROOM.idFromName(roomId);
    const stub = env.SIGNAL_ROOM.get(id);
    return stub.fetch(c.req.raw);
  }

  // Dev fallback: in-process WebSocket pair via signal-dev.
  return devSignalHandler(c.req.raw, roomId);
});
