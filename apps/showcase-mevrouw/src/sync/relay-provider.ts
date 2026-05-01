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
 *   3. Once the AES-GCM key is derived AND the socket is open, send a
 *      full state-vector update so any peer present catches up.
 *   4. On any local doc update (origin !== 'remote-relay'): encrypt and
 *      send as a relay payload.
 *   5. On incoming relay payload: decrypt → applyUpdate with origin
 *      RELAY_ORIGIN so the local update handler skips re-broadcasting.
 *   6. On `peer-joined` from the DO: push state vector again so the
 *      newcomer catches up. Idempotent (Yjs is CRDT).
 *   7. On disconnect: exponential backoff reconnect.
 *
 * Observability: subscribe(handler) → live status events. status carries
 * connection state, peer count, and the last-activity timestamp — used
 * by the in-app SyncStatus panel + the manual "Sync now" affordance.
 *
 * Encryption is end-to-end. The DO sees ciphertext + nonce only; the
 * couple code never leaves the two phones.
 */
import * as Y from 'yjs';
import { decrypt, deriveKey, encrypt, packFrame, unpackFrame } from './crypto.ts';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
export const RELAY_ORIGIN = 'remote-relay';

const log = (...args: unknown[]) => console.info('[mevrouw:relay]', ...args);

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

export type RelayStatus = 'connecting' | 'open' | 'closed';

export interface RelayState {
  status: RelayStatus;
  /** Number of OTHER peers currently in the room (excludes self). */
  peerCount: number;
  /** Wall-clock ms of the last successful inbound or outbound message, or null. */
  lastActivity: number | null;
  /** Wall-clock ms of the last error, if any. */
  lastError: { at: number; message: string } | null;
  /** WebSocket URL we're connecting to (handy for debugging in the field). */
  url: string;
  /** Stable peer id for this session. */
  peerId: string;
}

export interface RelayProvider extends RelayState {
  /** Subscribe to status changes. Returns an unsubscribe fn. */
  subscribe: (handler: (state: RelayState) => void) => () => void;
  /** Force-reconnect + push full state vector. UI surfaces this as "Sync now". */
  resync: () => void;
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
  const onKeyReady: (() => void)[] = [];
  const subscribers = new Set<(s: RelayState) => void>();

  const state: RelayState = {
    status: 'connecting',
    peerCount: 0,
    lastActivity: null,
    lastError: null,
    url,
    peerId,
  };

  const provider: RelayProvider = Object.assign(state, {
    subscribe(handler: (s: RelayState) => void): () => void {
      subscribers.add(handler);
      handler({ ...state });
      return () => subscribers.delete(handler);
    },
    resync(): void {
      log('resync requested');
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      reconnectAttempt = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connect();
    },
    destroy(): void {
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
      state.status = 'closed';
      emit();
      subscribers.clear();
    },
  });

  function emit(): void {
    const snapshot: RelayState = { ...state };
    for (const fn of subscribers) {
      try {
        fn(snapshot);
      } catch {
        /* ignore */
      }
    }
  }

  function setStatus(next: RelayStatus): void {
    if (state.status === next) return;
    state.status = next;
    log('status →', next);
    emit();
  }

  function setError(message: string): void {
    state.lastError = { at: Date.now(), message };
    log('error', message);
    emit();
  }

  function bumpActivity(): void {
    state.lastActivity = Date.now();
    emit();
  }

  function whenKey(fn: () => void): void {
    if (key) fn();
    else onKeyReady.push(fn);
  }

  void deriveKey(coupleCode)
    .then((k) => {
      key = k;
      log('key ready');
      flushPending();
      const queued = onKeyReady.splice(0);
      for (const fn of queued) fn();
    })
    .catch((err) => {
      setError(`key_derivation_failed: ${err instanceof Error ? err.message : String(err)}`);
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
      bumpActivity();
    } catch (err) {
      setError(`send_failed: ${err instanceof Error ? err.message : String(err)}`);
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
    if (!key || !ws || ws.readyState !== WebSocket.OPEN) return;
    const stateUpdate = Y.encodeStateAsUpdate(doc);
    if (stateUpdate.length === 0) return;
    log('sending state vector', stateUpdate.length, 'bytes');
    await sendUpdate(stateUpdate);
  }

  function connect(): void {
    if (destroyed) return;
    setStatus('connecting');
    let socket: WebSocket;
    try {
      log('opening ws', url);
      socket = new WebSocket(url);
    } catch (err) {
      setError(`ws_construct_failed: ${err instanceof Error ? err.message : String(err)}`);
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      setStatus('open');
      try {
        socket.send(JSON.stringify({ t: 'hello', peerId }));
        bumpActivity();
      } catch (err) {
        setError(`hello_failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      // Push full state once both the socket AND the key are ready.
      whenKey(() => {
        flushPending();
        void sendStateVector();
      });
    });

    socket.addEventListener('message', async (event: MessageEvent) => {
      bumpActivity();
      let msg: { t?: string; payload?: string; peerId?: string } | null = null;
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : null;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.t === 'peer-joined') {
        log('peer-joined', msg.peerId);
        state.peerCount += 1;
        emit();
        whenKey(() => void sendStateVector());
        return;
      }

      if (msg.t === 'peer-left') {
        log('peer-left', msg.peerId);
        state.peerCount = Math.max(0, state.peerCount - 1);
        emit();
        return;
      }

      if (msg.t === 'relay' && typeof msg.payload === 'string') {
        if (!key) {
          setError('inbound_relay_without_key');
          return;
        }
        try {
          const packed = fromBase64(msg.payload);
          const frame = unpackFrame(packed);
          const update = await decrypt(key, frame);
          Y.applyUpdate(doc, update, RELAY_ORIGIN);
          log('applied remote update', update.length, 'bytes');
        } catch (err) {
          setError(`decrypt_failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });

    socket.addEventListener('close', () => {
      log('ws closed');
      if (ws === socket) ws = null;
      state.peerCount = 0;
      if (!destroyed) setStatus('closed');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // 'close' fires next; reconnect handled there. Note error shape so UI can surface.
      setError('ws_error');
    });
  }

  function scheduleReconnect(): void {
    if (destroyed) return;
    const backoff = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    reconnectAttempt += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    log('reconnecting in', backoff, 'ms');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
  }

  doc.on('update', onLocalUpdate);
  connect();

  return provider;
}
