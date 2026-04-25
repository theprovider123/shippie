/**
 * Dev-mode signalling: in-process WebSocket fan-out.
 *
 * Cloudflare's DurableObject + WebSocketPair API isn't available under
 * Bun (the local dev server). This file implements the same protocol
 * with `Bun.upgrade` + a per-process Map of room → sockets, so the
 * proximity client can talk to either runtime without branching.
 *
 * Every room is keyed by `roomId`. When the last socket closes the
 * room is GC'd.
 */
import type { SignalMessage } from '../signal-types.ts';

interface PeerSocket {
  ws: WebSocketLike;
  peerId: string;
}

interface WebSocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
}

interface Room {
  peers: Map<WebSocketLike, PeerSocket>;
}

const rooms = new Map<string, Room>();

interface BunServer {
  upgrade(req: Request, opts?: { data?: unknown }): boolean;
}

interface BunWebSocketHandlers<T> {
  open?(ws: BunWebSocket<T>): void;
  message?(ws: BunWebSocket<T>, msg: string | Buffer): void;
  close?(ws: BunWebSocket<T>, code: number, reason: string): void;
}

interface BunWebSocket<T> extends WebSocketLike {
  data: T;
}

interface DevSocketData {
  roomId: string;
}

/**
 * Standard fetch handler — call from the Hono route. Returns a 426 if
 * the runtime can't upgrade (i.e. no `Bun.serve` context). Tests use
 * `runDevSignalingFlow` directly to drive the in-memory protocol.
 */
export async function devSignalHandler(req: Request, roomId: string): Promise<Response> {
  // Bun's server passes through the request and we have to call
  // `server.upgrade(...)`. Outside Bun we can't accept, so we 503.
  const server = (globalThis as { __SHIPPIE_BUN_SERVER__?: BunServer }).__SHIPPIE_BUN_SERVER__;
  if (!server) {
    return new Response('signalling-unavailable-in-this-runtime', { status: 503 });
  }
  const ok = server.upgrade(req, { data: { roomId } satisfies DevSocketData });
  if (!ok) {
    return new Response('upgrade-failed', { status: 500 });
  }
  // Bun returns nothing on a successful upgrade — Hono needs a Response,
  // so return a stubbed 101 (Bun ignores it after upgrade).
  return new Response(null, { status: 101 });
}

/**
 * Bun WebSocket handlers — wire into `Bun.serve({ websocket: ... })`
 * inside services/worker/src/server.dev.ts.
 */
export const devSignalWsHandlers: BunWebSocketHandlers<DevSocketData> = {
  open(ws) {
    const room = ensureRoom(ws.data.roomId);
    // Peer is added on first `hello`.
    room.peers; // touch to avoid eslint warn
  },
  message(ws, msg) {
    const room = ensureRoom(ws.data.roomId);
    handleFrame(room, ws, typeof msg === 'string' ? msg : msg.toString('utf8'));
  },
  close(ws) {
    const room = rooms.get(ws.data.roomId);
    if (!room) return;
    removePeer(room, ws);
    if (room.peers.size === 0) rooms.delete(ws.data.roomId);
  },
};

// ---------------------------------------------------------------------
// Helpers used by tests (mockable, no network)
// ---------------------------------------------------------------------

export function ensureRoom(roomId: string): Room {
  let r = rooms.get(roomId);
  if (!r) {
    r = { peers: new Map() };
    rooms.set(roomId, r);
  }
  return r;
}

export function clearAllRoomsForTests(): void {
  rooms.clear();
}

export function handleFrame(room: Room, ws: WebSocketLike, raw: string): void {
  let msg: SignalMessage | null = null;
  try {
    msg = JSON.parse(raw) as SignalMessage;
  } catch {
    return;
  }
  if (!msg || typeof msg.t !== 'string') return;

  if (msg.t === 'hello') {
    const peerId = (msg as { peerId?: unknown }).peerId;
    if (typeof peerId !== 'string' || !peerId) return;
    room.peers.set(ws, { ws, peerId });
    // Tell everyone else.
    for (const peer of room.peers.values()) {
      if (peer.ws === ws) continue;
      safeSend(
        peer.ws,
        JSON.stringify({ t: 'peer-joined', peerId } satisfies SignalMessage),
      );
      // Tell the new joiner about each existing peer.
      safeSend(
        ws,
        JSON.stringify({ t: 'peer-joined', peerId: peer.peerId } satisfies SignalMessage),
      );
    }
    return;
  }

  const to = (msg as { to?: unknown }).to;
  if (typeof to !== 'string') return;
  for (const peer of room.peers.values()) {
    if (peer.peerId === to) {
      safeSend(peer.ws, raw);
      return;
    }
  }
}

export function removePeer(room: Room, ws: WebSocketLike): void {
  const entry = room.peers.get(ws);
  if (!entry) return;
  room.peers.delete(ws);
  for (const peer of room.peers.values()) {
    safeSend(
      peer.ws,
      JSON.stringify({ t: 'peer-left', peerId: entry.peerId } satisfies SignalMessage),
    );
  }
}

function safeSend(ws: WebSocketLike, frame: string): void {
  try {
    ws.send(frame);
  } catch {
    // ignore — the close handler will GC the peer when the socket
    // notifies us.
  }
}
