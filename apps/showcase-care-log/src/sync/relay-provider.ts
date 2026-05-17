/**
 * RelayProvider — Yjs cross-device sync via the Shippie SignalRoom DO's
 * relay fan-out. Two caregivers' phones, same pair code, same Y.Doc state.
 *
 * Encryption is end-to-end. The DO sees ciphertext + nonce only; the
 * pair code never leaves the two phones.
 */
import * as Y from 'yjs';
import { decrypt, deriveKey, encrypt, packFrame, unpackFrame } from './crypto.ts';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
export const RELAY_ORIGIN = 'remote-relay';

const log = (...args: unknown[]) => console.info('[care-log:relay]', ...args);

export interface RelayProviderOptions {
  doc: Y.Doc;
  /** Opaque hash of the pair code; matches the SignalRoom URL slug. */
  roomId: string;
  /** Plaintext pair code — used only on this device for AES-GCM key derivation. */
  pairCode: string;
  /** Override for the WebSocket base URL. Tests pass mocks. Defaults to
   *  same-origin /__shippie/signal. */
  signalUrlBase?: string;
  /** Stable per-device id; defaults to a random 16-hex string per session. */
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

  void deriveKey(pairCode)
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
