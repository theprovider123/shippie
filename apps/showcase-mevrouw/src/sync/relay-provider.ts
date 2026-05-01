/**
 * RelayProvider — Yjs cross-device sync via the Shippie SignalRoom DO's
 * relay fan-out. Two phones in different cities, same couple code, same
 * Y.Doc state.
 *
 * Why not WebRTC P2P: `@shippie/proximity` is the proximity protocol —
 * it derives the room id from the device's PUBLIC IP, so peers on
 * different networks (cellular vs Wi-Fi, or two different LANs) get
 * different room ids and never find each other. Mevrouw is for couples
 * who may be in different cities; we need server-relayed sync, not P2P.
 *
 * Architecture:
 *   1. Open WebSocket to `${origin}/__shippie/signal/<roomId>`.
 *   2. Send `{ t: 'hello', peerId }` to authenticate with the room.
 *   3. On any local doc update (origin !== 'remote-relay'): encrypt the
 *      update via mevrouw's existing crypto.ts (AES-GCM derived from
 *      the couple code), send `{ t: 'relay', payload: base64 }`.
 *   4. On incoming `{ t: 'relay' }`: decrypt → applyUpdate with origin
 *      'remote-relay' so the local update handler skips re-broadcasting.
 *   5. On `{ t: 'peer-joined' }`: push our full state vector so the new
 *      peer catches up.
 *   6. On disconnect: exponential backoff reconnect.
 *
 * Encryption is end-to-end. The DO sees ciphertext + nonce only; the
 * couple code never leaves the two phones.
 */
import * as Y from 'yjs';
import { decrypt, deriveKey, encrypt, packFrame, unpackFrame } from './crypto.ts';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
export const RELAY_ORIGIN = 'remote-relay';

export interface RelayProviderOptions {
  doc: Y.Doc;
  /** Already-derived hash of the couple code; matches the SignalRoom URL slug. */
  roomId: string;
  /** Plaintext couple code — used only on this device for AES-GCM key derivation. */
  coupleCode: string;
  /** Override for the WebSocket base URL. Tests pass mocks. Defaults to
   *  same-origin /__shippie/signal. */
  signalUrlBase?: string;
  /** Stable per-device id; defaults to a random 16-hex string per session. */
  peerId?: string;
}

export interface RelayProvider {
  status: 'connecting' | 'open' | 'closed';
  destroy: () => void;
}

function generatePeerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function defaultSignalBase(): string {
  if (typeof location === 'undefined') return 'wss://shippie.app/__shippie/signal';
  // http(s) → ws(s) — works for shippie.app and any future self-host origin.
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/__shippie/signal`;
}

export function bindRelayProvider(opts: RelayProviderOptions): RelayProvider {
  const { doc, roomId, coupleCode } = opts;
  const peerId = opts.peerId ?? generatePeerId();
  const base = opts.signalUrlBase ?? defaultSignalBase();
  const url = `${base}/${encodeURIComponent(roomId)}`;

  let ws: WebSocket | null = null;
  let destroyed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let key: CryptoKey | null = null;
  const pendingOutbound: Uint8Array[] = [];

  const provider: RelayProvider = {
    status: 'connecting',
    destroy: () => {
      destroyed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      doc.off('update', onLocalUpdate);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      provider.status = 'closed';
    },
  };

  void deriveKey(coupleCode)
    .then((k) => {
      key = k;
      flushPending();
    })
    .catch(() => {
      // Crypto failed (Web Crypto unavailable, broken couple code).
      // Without a key we never relay — E2E is non-negotiable here.
    });

  function onLocalUpdate(update: Uint8Array, origin: unknown): void {
    if (origin === RELAY_ORIGIN) return;
    if (!key || !ws || ws.readyState !== WebSocket.OPEN) {
      pendingOutbound.push(update);
      return;
    }
    void sendUpdate(update);
  }

  async function sendUpdate(update: Uint8Array): Promise<void> {
    if (!key || !ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const frame = await encrypt(key, update);
      const packed = packFrame(frame);
      ws.send(JSON.stringify({ t: 'relay', payload: toBase64(packed) }));
    } catch {
      // Encryption failure — drop; the next state-vector exchange will
      // catch the peer up.
    }
  }

  function flushPending(): void {
    if (!key || !ws || ws.readyState !== WebSocket.OPEN) return;
    while (pendingOutbound.length > 0) {
      const u = pendingOutbound.shift();
      if (u) void sendUpdate(u);
    }
  }

  async function sendStateVector(): Promise<void> {
    // Encode the entire doc as a single update so a freshly-connected
    // peer catches up to our state. Cheap on small docs (mevrouw is).
    if (!key || !ws || ws.readyState !== WebSocket.OPEN) return;
    const state = Y.encodeStateAsUpdate(doc);
    if (state.length === 0) return;
    await sendUpdate(state);
  }

  function connect(): void {
    if (destroyed) return;
    provider.status = 'connecting';
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      provider.status = 'open';
      try {
        socket.send(JSON.stringify({ t: 'hello', peerId }));
      } catch {
        return;
      }
      flushPending();
      void sendStateVector();
    });

    socket.addEventListener('message', async (event: MessageEvent) => {
      let msg: { t?: string; payload?: string } | null = null;
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : null;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.t === 'peer-joined') {
        // New peer arrived — push our state so they catch up.
        void sendStateVector();
        return;
      }

      if (msg.t === 'relay' && typeof msg.payload === 'string') {
        if (!key) return;
        try {
          const packed = fromBase64(msg.payload);
          const frame = unpackFrame(packed);
          const update = await decrypt(key, frame);
          Y.applyUpdate(doc, update, RELAY_ORIGIN);
        } catch {
          // Malformed or wrong-key — silently drop.
        }
      }
    });

    socket.addEventListener('close', () => {
      if (ws === socket) ws = null;
      if (!destroyed) provider.status = 'closed';
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // 'close' fires next; reconnect handled there.
    });
  }

  function scheduleReconnect(): void {
    if (destroyed) return;
    const backoff = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    reconnectAttempt += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
  }

  doc.on('update', onLocalUpdate);
  connect();

  return provider;
}
