// Lightweight realtime for the live match-day second screen.
//
// BroadcastChannel gives instant, zero-backend sync across tabs/windows on the
// same device (and, when the platform wraps the app, across same-origin
// surfaces). It degrades to a no-op offline-single-tab. The interface is kept
// deliberately small so a future Shippie SignalRoom transport can drop in
// behind `publish`/`subscribe` without touching callers.

export type LiveEvent =
  | { kind: "reaction"; matchId: string; emoji: string; uid: string; at: number }
  | { kind: "score"; matchId: string; home: number; away: number; uid: string; at: number }
  | { kind: "presence"; uid: string; name: string; at: number };

type Handler = (e: LiveEvent) => void;

const CHANNEL = "golazo:live";

export class LiveBus {
  private bc: BroadcastChannel | null = null;
  private handlers = new Set<Handler>();

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.bc = new BroadcastChannel(CHANNEL);
        this.bc.onmessage = (ev) => {
          const data = ev.data as LiveEvent;
          this.handlers.forEach((h) => h(data));
        };
      } catch {
        this.bc = null;
      }
    }
  }

  publish(e: LiveEvent): void {
    // Echo locally first so the sender sees instant feedback even with no peers.
    this.handlers.forEach((h) => h(e));
    try {
      this.bc?.postMessage(e);
    } catch {
      /* ignore — offline / unsupported */
    }
  }

  subscribe(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  close(): void {
    this.handlers.clear();
    try {
      this.bc?.close();
    } catch {
      /* ignore */
    }
  }
}

let shared: LiveBus | null = null;
export function liveBus(): LiveBus {
  if (!shared) shared = new LiveBus();
  return shared;
}
