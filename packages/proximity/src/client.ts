/**
 * WebSocket client to /__shippie/signal/<roomId>.
 *
 * Wraps a vanilla WebSocket with:
 *   - JSON frame parser
 *   - Auto-reconnect with exponential backoff (capped at 30s)
 *   - Typed send + on()
 *   - readyState pass-through
 *
 * The DO never persists anything, so reconnects re-send `hello` and
 * the DO re-broadcasts membership.
 */
import type { SignalMessage } from './types.ts';

export interface SignalClientOptions {
  /** Full URL: wss://app.shippie.app/__shippie/signal/<roomId>. */
  url: string;
  /** WebSocket ctor — override for tests. */
  WebSocket?: typeof WebSocket;
  /** Multiplier for the reconnect backoff (default 1500ms). */
  baseBackoffMs?: number;
  /** Max backoff cap (default 30_000ms). */
  maxBackoffMs?: number;
  /** Disable reconnect entirely. */
  noReconnect?: boolean;
}

export class SignalClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(msg: SignalMessage) => void>>();
  private openListeners = new Set<() => void>();
  private closeListeners = new Set<() => void>();
  private errorListeners = new Set<(err: Error) => void>();
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly Ctor: typeof WebSocket;
  private readonly base: number;
  private readonly maxMs: number;
  private readonly noReconnect: boolean;

  constructor(private opts: SignalClientOptions) {
    const Ctor =
      opts.WebSocket ??
      (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!Ctor) throw new Error('SignalClient: WebSocket is not available');
    this.Ctor = Ctor;
    this.base = opts.baseBackoffMs ?? 1500;
    this.maxMs = opts.maxBackoffMs ?? 30_000;
    this.noReconnect = !!opts.noReconnect;
  }

  connect(): void {
    if (this.closed) throw new Error('SignalClient: closed');
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    const ws = new this.Ctor(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      for (const fn of this.openListeners) fn();
    };
    ws.onmessage = (e) => {
      const data = e.data;
      let msg: SignalMessage | null = null;
      try {
        msg = typeof data === 'string' ? (JSON.parse(data) as SignalMessage) : null;
      } catch {
        msg = null;
      }
      if (!msg || typeof msg.t !== 'string') return;
      const set = this.listeners.get(msg.t);
      if (set) for (const fn of set) fn(msg);
    };
    ws.onerror = () => {
      for (const fn of this.errorListeners) fn(new Error('signal: websocket error'));
    };
    ws.onclose = () => {
      for (const fn of this.closeListeners) fn();
      if (!this.closed && !this.noReconnect) this.scheduleReconnect();
    };
  }

  send(msg: SignalMessage): void {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('SignalClient: not open');
    }
    this.ws.send(JSON.stringify(msg));
  }

  on<K extends SignalMessage['t']>(
    type: K,
    handler: (msg: Extract<SignalMessage, { t: K }>) => void,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler as (msg: SignalMessage) => void);
    return () => {
      set!.delete(handler as (msg: SignalMessage) => void);
    };
  }

  onOpen(fn: () => void): () => void {
    this.openListeners.add(fn);
    return () => this.openListeners.delete(fn);
  }

  onClose(fn: () => void): () => void {
    this.closeListeners.add(fn);
    return () => this.closeListeners.delete(fn);
  }

  onError(fn: (err: Error) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  /** Permanently close the client; no more reconnects. */
  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  get readyState(): number {
    return this.ws?.readyState ?? 3;
  }

  private scheduleReconnect() {
    this.attempt += 1;
    const wait = Math.min(this.maxMs, this.base * 2 ** Math.min(this.attempt, 6));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, wait);
  }
}

/**
 * Build a signalling URL given a base + roomId. Relative bases are
 * resolved against the current origin; absolute URLs win as-is. Always
 * upgraded to ws/wss.
 */
export function buildSignalUrl(base: string, roomId: string): string {
  let resolved: URL;
  if (/^https?:\/\//i.test(base) || /^wss?:\/\//i.test(base)) {
    resolved = new URL(base);
  } else {
    const origin =
      typeof location !== 'undefined' ? location.origin : 'https://shippie.app';
    resolved = new URL(base, origin);
  }
  if (resolved.protocol === 'http:') resolved.protocol = 'ws:';
  if (resolved.protocol === 'https:') resolved.protocol = 'wss:';
  // Strip trailing slash, then append /<roomId>.
  resolved.pathname = resolved.pathname.replace(/\/$/, '') + '/' + roomId;
  return resolved.toString();
}
