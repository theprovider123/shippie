/**
 * Cook-with-me proximity hero (spec §5.1).
 *
 * Two phones in the same kitchen sync step + ingredient list + timer.
 * Transport: we broadcast a `cooking-now` intent through the same
 * relay the rest of Palate uses (the iframe SDK's intent bus, which
 * the container fans out to other Palate installs via relay-gossip —
 * see `packages/proximity/src/client.ts` for the underlying signal
 * channel and `apps/showcase-match-room/src/shared/relay-gossip.ts`
 * for the Match-Room precedent). For ergonomics + testability, we
 * abstract the broadcast/subscribe pair into a `CookAlongClient` —
 * the real SDK is one implementation, mocks are another.
 *
 * Wire format (last-writer-wins via timestamp):
 *
 *   {
 *     recipeId:        string
 *     title:           string
 *     step:            number   // 0-indexed cursor into the recipe steps
 *     totalSteps:      number
 *     servings:        number
 *     timerExpiresAt:  number | null  // epoch ms; null when no timer running
 *     sessionId:       string   // generated on CookMode entry; expires 4h
 *     sessionStartedAt: number  // epoch ms — used for 4h TTL
 *     hostPeerId:      string   // who initiated this cook
 *     senderPeerId:    string   // who just advanced
 *     updatedAt:       number   // epoch ms — drives LWW conflict resolution
 *   }
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export const COOKING_NOW_INTENT = 'cooking-now';
export const COOK_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4h per spec

export interface CookAlongPayload {
  recipeId: string;
  title: string;
  step: number;
  totalSteps: number;
  servings: number;
  timerExpiresAt: number | null;
  sessionId: string;
  sessionStartedAt: number;
  hostPeerId: string;
  senderPeerId: string;
  updatedAt: number;
}

export interface CookAlongClient {
  /** Local peer id (stable for this device, opaque). */
  peerId: string;
  /** Push a `cooking-now` payload to all other peers in the network. */
  broadcast(payload: CookAlongPayload): void;
  /**
   * Subscribe to peer broadcasts. Receiver is responsible for ignoring
   * its own echoes (compare `senderPeerId` to `peerId`). Returns an
   * unsubscribe function.
   */
  subscribe(handler: (payload: CookAlongPayload) => void): () => void;
}

/**
 * Build a CookAlongClient backed by an iframe-sdk-shaped intent bus.
 * The bus only has to satisfy this minimal shape — that keeps tests
 * trivial and the real SDK a drop-in.
 */
export interface IntentBusLike {
  broadcast(intent: string, rows: ReadonlyArray<unknown>): void;
  subscribe(
    intent: string,
    handler: (broadcast: { intent: string; rows: ReadonlyArray<unknown> }) => void,
  ): () => void;
}

export function createCookAlongClient(bus: IntentBusLike, peerId: string): CookAlongClient {
  return {
    peerId,
    broadcast(payload) {
      bus.broadcast(COOKING_NOW_INTENT, [payload]);
    },
    subscribe(handler) {
      return bus.subscribe(COOKING_NOW_INTENT, (msg) => {
        for (const row of msg.rows) {
          if (isCookAlongPayload(row)) handler(row);
        }
      });
    },
  };
}

function isCookAlongPayload(value: unknown): value is CookAlongPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.recipeId === 'string' &&
    typeof v.title === 'string' &&
    typeof v.step === 'number' &&
    typeof v.sessionId === 'string' &&
    typeof v.sessionStartedAt === 'number' &&
    typeof v.senderPeerId === 'string' &&
    typeof v.updatedAt === 'number'
  );
}

/**
 * React hook that wires a CookAlongClient into local state with
 * last-writer-wins merging. Returns the latest peer payload (or
 * null when no peer has broadcast in this 4h window) and a setter
 * the local UI can call to broadcast its own advance.
 */
export function useCookAlongPeer(client: CookAlongClient | null): {
  peer: CookAlongPayload | null;
  publish: (payload: CookAlongPayload) => void;
} {
  const [peer, setPeer] = useState<CookAlongPayload | null>(null);
  const peerRef = useRef<CookAlongPayload | null>(null);
  peerRef.current = peer;

  useEffect(() => {
    if (!client) return;
    return client.subscribe((incoming) => {
      // Ignore our own echoes — the relay is one-to-many.
      if (incoming.senderPeerId === client.peerId) return;
      // Drop expired sessions (4h TTL per spec §5.1).
      if (Date.now() - incoming.sessionStartedAt > COOK_SESSION_TTL_MS) return;
      const current = peerRef.current;
      if (current && current.sessionId === incoming.sessionId && current.updatedAt >= incoming.updatedAt) {
        return; // Stale update for an in-flight session — last-writer-wins.
      }
      setPeer(incoming);
    });
  }, [client]);

  return {
    peer,
    publish: (payload) => {
      client?.broadcast(payload);
    },
  };
}

/**
 * Cook-Along view — the second-phone surface that opens when a peer
 * accepts the IntentToast. Mirrors the host's CookMode but read-only
 * (advance buttons broadcast back so it's still cooperative, but the
 * authoritative state is whatever has the latest `updatedAt`).
 */
export function CookAlongView({
  payload,
  onAdvance,
  onClose,
}: {
  payload: CookAlongPayload;
  onAdvance: (nextStep: number) => void;
  onClose: () => void;
}) {
  const stepIndex = Math.max(0, Math.min(payload.step, Math.max(payload.totalSteps - 1, 0)));
  const timerLeft = useTimerCountdown(payload.timerExpiresAt);
  return (
    <div className="cook-along" role="dialog" aria-label={`Cook along: ${payload.title}`}>
      <header>
        <button type="button" onClick={onClose}>Exit</button>
        <div>
          <p className="eyebrow">Cooking together</p>
          <h1>{payload.title}</h1>
          <p className="cook-along-meta">
            Step {stepIndex + 1} / {Math.max(payload.totalSteps, 1)} · serves {payload.servings}
          </p>
        </div>
        {timerLeft !== null ? (
          <p className="cook-along-timer" aria-live="polite">
            {formatTimer(timerLeft)}
          </p>
        ) : null}
      </header>
      <section className="cook-along-step">
        <p>Following along with the other phone.</p>
      </section>
      <footer>
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => onAdvance(stepIndex - 1)}
        >
          Back
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onAdvance(stepIndex + 1)}
        >
          Next step
        </button>
      </footer>
    </div>
  );
}

function useTimerCountdown(expiresAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt == null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  if (expiresAt == null) return null;
  return Math.max(0, expiresAt - now);
}

function formatTimer(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Generate a session id that is stable for one Cook Mode run. */
export function newCookSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `cook_${crypto.randomUUID()}`;
  }
  return `cook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable, opaque peer id for this device — used as the LWW author. */
export function loadOrCreatePeerId(): string {
  const STORAGE_KEY = 'shippie.palate.cook-along.peer-id.v1';
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = newCookSessionId().replace(/^cook_/, 'peer_');
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return newCookSessionId().replace(/^cook_/, 'peer_');
  }
}
