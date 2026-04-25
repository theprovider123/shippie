/**
 * SignalRoom — Cloudflare Durable Object for the Proximity Protocol.
 *
 * One DO instance per roomId (sha256(public_ip + app_slug + group_code)).
 * Holds an in-memory set of WebSockets representing the devices currently
 * pinging the room. When a frame lands the DO fans it out:
 *   - `hello`            → broadcasts `peer-joined` to all others.
 *   - `offer/answer/ice` → forwards to the addressed peer.
 *   - WebSocket close    → broadcasts `peer-left`.
 *
 * No persistence. The DO hibernates as soon as the last socket closes.
 *
 * Why a DO and not a single global Worker actor:
 *   - Each room is independent. Cloudflare's DO routing pins all ws
 *     upgrades for the same roomId to the same instance, which is the
 *     property we need.
 *   - DO hibernation API keeps the cost ≈0 between active rooms.
 */
import type { SignalMessage } from './signal-types.ts';

interface PeerSocket {
  ws: WebSocket;
  peerId: string;
}

// Cloudflare's `DurableObjectState` shape — minimal subset we touch.
interface DurableObjectStateLite {
  acceptWebSocket?(ws: WebSocket, tags?: string[]): void;
  getWebSockets?(tag?: string): WebSocket[];
}

export class SignalRoom {
  // Track sockets either via the hibernation API or a plain Set in dev.
  private peers = new Map<WebSocket, PeerSocket>();

  constructor(private state: DurableObjectStateLite) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('upgrade')?.toLowerCase();
    if (upgrade !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    // WebSocketPair is a Cloudflare global. In dev (Bun), we accept the
    // upgrade differently — but `signal-room.ts` only runs in CF prod.
    const Pair = (globalThis as { WebSocketPair?: new () => Record<number, WebSocket> }).WebSocketPair;
    if (!Pair) {
      return new Response('runtime missing WebSocketPair', { status: 500 });
    }
    const pair = new Pair();
    const client = pair[0]!;
    const server = pair[1]!;

    if (this.state.acceptWebSocket) {
      this.state.acceptWebSocket(server);
    } else {
      (server as { accept?: () => void }).accept?.();
    }
    this.attachServerHandlers(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  // CF hibernation handlers (called when state.acceptWebSocket is used).
  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): void {
    this.handleMessage(ws, typeof msg === 'string' ? msg : new TextDecoder().decode(msg));
  }

  webSocketClose(ws: WebSocket): void {
    this.removePeer(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.removePeer(ws);
  }

  // ----- internals --------------------------------------------------

  private attachServerHandlers(ws: WebSocket): void {
    // For runtimes that *don't* use the hibernation API we wire the
    // standard event listeners instead.
    if (this.state.acceptWebSocket) return;
    ws.addEventListener('message', (e) =>
      this.handleMessage(
        ws,
        typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer),
      ),
    );
    ws.addEventListener('close', () => this.removePeer(ws));
    ws.addEventListener('error', () => this.removePeer(ws));
  }

  private handleMessage(ws: WebSocket, raw: string): void {
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
      this.peers.set(ws, { ws, peerId });
      this.broadcast(
        ws,
        JSON.stringify({ t: 'peer-joined', peerId } satisfies SignalMessage),
      );
      // Send the joining peer a list of existing members so they know
      // who to handshake with — emit one `peer-joined` per existing peer.
      for (const [otherWs, info] of this.peers) {
        if (otherWs === ws) continue;
        this.safeSend(
          ws,
          JSON.stringify({ t: 'peer-joined', peerId: info.peerId } satisfies SignalMessage),
        );
      }
      return;
    }

    // Offer/answer/ice — forward to the addressed peer only.
    const to = (msg as { to?: unknown }).to;
    if (typeof to !== 'string') return;
    const target = this.findPeer(to);
    if (!target) return;
    this.safeSend(target.ws, raw);
  }

  private removePeer(ws: WebSocket): void {
    const entry = this.peers.get(ws);
    if (!entry) return;
    this.peers.delete(ws);
    this.broadcast(
      ws,
      JSON.stringify({ t: 'peer-left', peerId: entry.peerId } satisfies SignalMessage),
    );
  }

  private broadcast(except: WebSocket, frame: string): void {
    for (const peer of this.peers.values()) {
      if (peer.ws === except) continue;
      this.safeSend(peer.ws, frame);
    }
  }

  private findPeer(peerId: string): PeerSocket | null {
    for (const peer of this.peers.values()) {
      if (peer.peerId === peerId) return peer;
    }
    return null;
  }

  private safeSend(ws: WebSocket, frame: string): void {
    try {
      ws.send(frame);
    } catch {
      // Lost socket — drop and emit peer-left.
      this.removePeer(ws);
    }
  }
}
