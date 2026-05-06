/**
 * RelayProvider — Yjs cross-device sync for an opted-in pair.
 *
 * Lifted from apps/showcase-mevrouw/src/sync/relay-provider.ts. Same
 * architecture: WebSocket to the SignalRoom DO + AES-GCM E2E encryption
 * + exponential reconnect. Cycle-specific concerns:
 *
 *   - When `share_with_partner` is OFF in prefs, this provider is NOT
 *     instantiated. The toggle is structural, not a preference.
 *   - The shared Y.Doc is a projection, not a mirror, of the local DB.
 *     The local-db is the source of truth; we publish only the fields
 *     the user picked in `partner_seen_fields`.
 */
import * as Y from 'yjs';
import { decrypt, deriveKey, encrypt, packFrame, unpackFrame } from './crypto.ts';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
export const RELAY_ORIGIN = 'remote-relay';

const log = (...args: unknown[]) => console.info('[cycle:relay]', ...args);

export interface RelayProviderOptions {
  doc: Y.Doc;
  roomId: string;
  pairCode: string;
  signalUrlBase?: string;
  peerId?: string;
}

export type RelayStatus = 'connecting' | 'open' | 'closed';

export interface RelayState {
  status: RelayStatus;
  peerCount: number;
  lastActivity: number | null;
  lastError: { at: number; message: string } | null;
  url: string;
  peerId: string;
}

export interface RelayProvider extends RelayState {
  subscribe: (handler: (state: RelayState) => void) => () => void;
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
  const { doc, roomId, pairCode } = opts;
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
    emit();
  }

  function setError(message: string): void {
    state.lastError = { at: Date.now(), message };
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

  void deriveKey(pairCode)
    .then((k) => {
      key = k;
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
    await sendUpdate(stateUpdate);
  }

  function connect(): void {
    if (destroyed) return;
    setStatus('connecting');
    let socket: WebSocket;
    try {
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
        state.peerCount += 1;
        emit();
        whenKey(() => void sendStateVector());
        return;
      }

      if (msg.t === 'peer-left') {
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
        } catch (err) {
          setError(`decrypt_failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });

    socket.addEventListener('close', () => {
      if (ws === socket) ws = null;
      state.peerCount = 0;
      if (!destroyed) setStatus('closed');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      setError('ws_error');
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
