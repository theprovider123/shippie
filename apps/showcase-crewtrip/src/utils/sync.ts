import { useEffect, useRef, useState } from 'react';
import type { CrewtripState, SyncState } from '../types';
import { mergeCrewtripState } from './state';

export function useCrewtripSync(
  state: CrewtripState,
  setState: (updater: (current: CrewtripState) => CrewtripState) => void,
  deviceId: string,
  enabled: boolean,
): SyncState {
  const [sync, setSync] = useState<SyncState>({ status: 'local', peers: 0, lastSyncedAt: null });
  const stateRef = useRef(state);
  const wsRef = useRef<WebSocket | null>(null);
  const keyRef = useRef<Promise<CryptoKey> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!enabled) {
      setSync({ status: 'local', peers: 0, lastSyncedAt: null });
      return;
    }
    const room = roomIdFor(state.eventCode);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`crewtrip:${room}`);
    let closed = false;

    channel?.addEventListener('message', (event: MessageEvent) => {
      const remote = (event.data as { state?: CrewtripState } | null)?.state;
      if (remote) applyRemoteState(remote);
    });

    if (typeof WebSocket !== 'undefined' && canUseSignalRelay()) {
      setSync((current) => ({ ...current, status: 'connecting' }));
      const ws = new WebSocket(signalUrlForRoom(room));
      wsRef.current = ws;
      keyRef.current = deriveCrewtripKey(state.eventCode);

      ws.addEventListener('open', () => {
        if (closed) return;
        ws.send(JSON.stringify({ t: 'hello', peerId: deviceId }));
        setSync((current) => ({ ...current, status: 'open', lastSyncedAt: Date.now() }));
        void sendSocketState(stateRef.current);
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        let msg: { t?: string; payload?: string; peerId?: string } | null = null;
        try {
          msg = typeof event.data === 'string' ? JSON.parse(event.data) : null;
        } catch {
          return;
        }
        if (!msg) return;
        if (msg.t === 'peer-joined') {
          setSync((current) => ({ ...current, peers: current.peers + 1, lastSyncedAt: Date.now() }));
          void sendSocketState(stateRef.current);
          return;
        }
        if (msg.t === 'peer-left') {
          setSync((current) => ({ ...current, peers: Math.max(0, current.peers - 1), lastSyncedAt: Date.now() }));
          return;
        }
        if (msg.t === 'relay' && typeof msg.payload === 'string') {
          void decryptSnapshot(msg.payload, keyRef.current)
            .then(applyRemoteState)
            .catch(() => undefined);
        }
      });

      ws.addEventListener('close', () => {
        if (closed) return;
        setSync((current) => ({ ...current, status: 'closed', peers: 0 }));
      });

      ws.addEventListener('error', () => {
        if (closed) return;
        setSync((current) => ({ ...current, status: 'closed', peers: 0 }));
      });
    }

    function applyRemoteState(remote: CrewtripState) {
      if (remote.updatedBy === deviceId || remote.eventCode !== stateRef.current.eventCode) return;
      setState((current) => mergeCrewtripState(remote, current));
      setSync((current) => ({ ...current, lastSyncedAt: Date.now() }));
    }

    async function sendSocketState(snapshot: CrewtripState) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = await encryptSnapshot(snapshot, keyRef.current);
      ws.send(JSON.stringify({ t: 'relay', payload }));
      setSync((current) => ({ ...current, lastSyncedAt: Date.now() }));
    }

    return () => {
      closed = true;
      channel?.close();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore close failures
        }
      }
      wsRef.current = null;
    };
  }, [deviceId, enabled, setState, state.eventCode]);

  useEffect(() => {
    if (!enabled) return;
    if (state.updatedBy !== deviceId) return;
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`crewtrip:${roomIdFor(state.eventCode)}`);
      channel.postMessage({ state });
      channel.close();
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      void encryptSnapshot(state, keyRef.current).then((payload) => {
        ws.send(JSON.stringify({ t: 'relay', payload }));
        setSync((current) => ({ ...current, lastSyncedAt: Date.now() }));
      });
    }
  }, [deviceId, enabled, state]);

  return sync;
}

function roomIdFor(eventCode: string): string {
  return eventCode.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function signalUrlForRoom(roomId: string): string {
  if (typeof location === 'undefined') return `wss://shippie.app/__shippie/signal/${encodeURIComponent(roomId)}`;
  if (location.hostname === 'shippie.app' && location.pathname.startsWith('/run/crewtrip')) {
    return `wss://crewtrip.shippie.app/__shippie/signal/${encodeURIComponent(roomId)}`;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/__shippie/signal/${encodeURIComponent(roomId)}`;
}

function canUseSignalRelay(): boolean {
  if (typeof location === 'undefined') return true;
  const localDevHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  return !localDevHost || location.pathname.startsWith('/run/');
}

async function deriveCrewtripKey(eventCode: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(eventCode),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('crewtrip-sync:v1'),
      iterations: 60_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSnapshot(state: CrewtripState, keyPromise: Promise<CryptoKey> | null): Promise<string> {
  const key = await (keyPromise ?? deriveCrewtripKey(state.eventCode));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));
  const packed = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
  packed.set(nonce, 0);
  packed.set(ciphertext, nonce.byteLength);
  return toBase64(packed);
}

async function decryptSnapshot(payload: string, keyPromise: Promise<CryptoKey> | null): Promise<CrewtripState> {
  const packed = fromBase64(payload);
  const nonce = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const key = await keyPromise;
  if (!key) throw new Error('Missing sync key');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as CrewtripState;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}
