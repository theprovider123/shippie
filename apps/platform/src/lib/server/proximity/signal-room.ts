/**
 * SignalRoom — Cloudflare Durable Object for the Proximity Protocol's
 * WebSocket signalling layer.
 *
 * Per-room WebSocket fan-out, in-memory state. Messages match the
 * `SignalMessage` shapes defined in `@shippie/proximity/types`:
 *
 *   hello       { t, peerId }                        — peer announces itself
 *   peer-joined { t, peerId }                        — broadcast to others
 *   peer-left   { t, peerId }                        — broadcast on disconnect
 *   offer       { t, from, to, sdp }                 — targeted to one peer
 *   answer      { t, from, to, sdp }                 — targeted to one peer
 *   ice         { t, from, to, candidate }           — targeted to one peer
 *   relay       { t, from?, payload }                — fan-out opaque bytes
 *
 * The DO never persists state — signalling traffic is ephemeral. After
 * WebRTC handshake completes, peers talk P2P and the DO is silent.
 *
 * Relay mode (added 2026-05-01 for mevrouw cross-device sync): apps
 * that need server-relayed sync (couples app on different networks,
 * where WebRTC P2P + STUN can't punch through CGNAT) post a `relay`
 * message; the DO fans out `payload` to every other peer in the room.
 * Payload is opaque to the DO — apps E2E-encrypt their own bytes.
 *
 * Privacy boundary: this DO can still observe room membership, peer IDs,
 * connection timing, and relay volume while a room is active. The claim is
 * "no app content is stored on Shippie servers by default", not "no
 * metadata exists".
 *
 * Auth: the route forwarding to this DO is responsible for any auth
 * gating (e.g., room visibility checks). The DO itself is pure routing.
 *
 * Operational notes:
 *   - The DO can be lazily evicted by the runtime after all WebSockets
 *     close. State is rebuilt from the next `hello` exchange.
 *   - We intentionally don't use hibernation API yet — keeping the
 *     handler simple. Switch to `state.acceptWebSocket()` if/when
 *     concurrency exceeds what the active-handler model supports.
 */

interface PeerId {
  /** Identity from the SignalHello frame. */
  id: string;
  /** Server-side WebSocket end of the upgrade. */
  ws: WebSocket;
}

type AnyMessage = {
  t?: string;
  peerId?: string;
  from?: string;
  to?: string;
  sdp?: string;
  candidate?: unknown;
  payload?: string;
};

interface DurableObjectStateLite {
  /** Cloudflare's DurableObjectState — we only use the marker for typing. */
  storage: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> };
}

/**
 * Constructor signature compatible with Cloudflare's DurableObject contract.
 * We don't reference `cloudflare:workers` types at compile time so this file
 * can be typechecked without the Workers types package — they're injected
 * by `@cloudflare/workers-types` at the platform's wrangler boundary.
 */
export class SignalRoom {
  private readonly peers = new Map<string, PeerId>();

  // Cloudflare passes (state, env). We don't persist anything but accept
  // the args to match the runtime contract.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_state: DurableObjectStateLite, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')?.toLowerCase();
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
    }

    // Cloudflare WebSocketPair — globally available in Workers runtime.
    const Pair = (globalThis as unknown as { WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } } })
      .WebSocketPair;
    const pair = new Pair();
    const client = pair[0];
    const server = pair[1];

    // server.accept() is the workerd-specific method to take ownership.
    (server as unknown as { accept: () => void }).accept();
    this.acceptPeer(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  /**
   * Wire up message + close handlers on a server-side WebSocket. Extracted
   * from `fetch` so unit tests can drive the routing logic without going
   * through the Workers-only `new Response({ status: 101, webSocket })`
   * pathway. In production, `fetch` calls this immediately after creating
   * the WebSocketPair.
   */
  acceptPeer(server: WebSocket): void {
    let myPeerId: string | null = null;

    server.addEventListener('message', (event: MessageEvent) => {
      const data = event.data;
      let msg: AnyMessage | null = null;
      try {
        msg = typeof data === 'string' ? (JSON.parse(data) as AnyMessage) : null;
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;

      // First-contact handshake — records the peer and broadcasts joins.
      if (msg.t === 'hello' && typeof msg.peerId === 'string') {
        if (myPeerId !== null) return; // ignore re-hello on the same socket
        myPeerId = msg.peerId;
        const newcomer = { id: myPeerId, ws: server };
        // Tell the newcomer about everyone already present.
        for (const existing of this.peers.values()) {
          this.send(server, { t: 'peer-joined', peerId: existing.id });
        }
        // Tell everyone present that the newcomer joined.
        for (const existing of this.peers.values()) {
          this.send(existing.ws, { t: 'peer-joined', peerId: myPeerId });
        }
        this.peers.set(myPeerId, newcomer);
        return;
      }

      // Targeted relay for SDP / ICE.
      if (msg.t === 'offer' || msg.t === 'answer' || msg.t === 'ice') {
        if (typeof msg.to !== 'string') return;
        const target = this.peers.get(msg.to);
        if (!target) return;
        this.send(target.ws, msg);
        return;
      }

      // Fan-out relay — broadcast opaque payload to every other peer.
      // Used by apps that need server-relayed sync regardless of network
      // topology (e.g. mevrouw on cellular ↔ Wi-Fi). DO never decrypts;
      // apps E2E-encrypt their own bytes.
      if (msg.t === 'relay' && typeof msg.payload === 'string') {
        if (myPeerId === null) return; // only authenticated peers can relay
        const stamped: AnyMessage = { t: 'relay', from: myPeerId, payload: msg.payload };
        for (const peer of this.peers.values()) {
          if (peer.id === myPeerId) continue;
          this.send(peer.ws, stamped);
        }
        return;
      }
    });

    const onClose = () => {
      if (myPeerId === null) return;
      const recorded = this.peers.get(myPeerId);
      if (!recorded || recorded.ws !== server) return; // stale close
      this.peers.delete(myPeerId);
      for (const remaining of this.peers.values()) {
        this.send(remaining.ws, { t: 'peer-left', peerId: myPeerId });
      }
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
  }

  private send(ws: WebSocket, msg: AnyMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Peer dropped — close handler will clean it up.
    }
  }
}
