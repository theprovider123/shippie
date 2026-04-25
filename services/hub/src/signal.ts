/**
 * WebSocket signalling endpoint for the Hub.
 *
 * Mirrors the cloud relay's `/__shippie/signal/<roomId>` route in
 * `services/worker`. Same wire shape, same semantics — the wrapper's
 * proximity client doesn't care which one it's hitting.
 *
 * Wire shape (from packages/proximity/src/types.ts):
 *   { t: 'hello',       peerId }                   ← client → hub
 *   { t: 'peer-joined', peerId }                   ← hub → all
 *   { t: 'peer-left',   peerId }                   ← hub → all
 *   { t: 'offer'|'answer'|'ice', from, to, ... }   ← peer ↔ peer (relayed)
 *
 * The Hub is a forwarding relay only. It never inspects offer SDP, ICE
 * candidates, or any payload beyond `t` / `to` / `peerId`.
 */

import type { ServerWebSocket } from 'bun';
import type { HubState, PeerSocket } from './state.ts';

interface WsData {
  roomId: string;
  peerId: string | null;
}

export function wsHandlerFor(state: HubState) {
  return {
    open(ws: ServerWebSocket<WsData>) {
      // Defer joining the room until 'hello' — the peerId is the
      // identifier we register in state, and clients always send hello
      // first.
      ws.send(JSON.stringify({ t: 'hub-ready' }));
    },
    message(ws: ServerWebSocket<WsData>, raw: string | Uint8Array) {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      let msg: { t?: string; peerId?: string; to?: string; from?: string };
      try {
        msg = JSON.parse(text);
      } catch {
        return; // Malformed — silently drop.
      }
      if (!msg || typeof msg !== 'object') return;

      const data = ws.data;

      if (msg.t === 'hello') {
        if (!msg.peerId || typeof msg.peerId !== 'string') return;
        data.peerId = msg.peerId;
        const peer: PeerSocket = {
          peerId: msg.peerId,
          send: (s) => ws.send(s),
          close: () => ws.close(),
        };
        state.joinRoom(data.roomId, peer);
        return;
      }

      // All other messages require a registered peer id.
      if (!data.peerId) return;
      if (msg.t === 'offer' || msg.t === 'answer' || msg.t === 'ice') {
        state.forward(data.roomId, data.peerId, msg as { t: string; to?: string });
      }
    },
    close(ws: ServerWebSocket<WsData>) {
      const { roomId, peerId } = ws.data;
      if (peerId) state.leaveRoom(roomId, peerId);
    },
  };
}

/**
 * Pull the room id out of the URL path. The wrapper hits
 *   /__shippie/signal/<roomId>
 *   /signal/<roomId>
 * (both forms are accepted so the same client works against the cloud
 * worker and the Hub.)
 */
export function extractRoomId(pathname: string): string | null {
  const m = /\/(?:__shippie\/)?signal\/([a-zA-Z0-9_-]+)/.exec(pathname);
  return m?.[1] ?? null;
}
