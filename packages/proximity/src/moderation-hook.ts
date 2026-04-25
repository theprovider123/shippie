/**
 * Group moderation hook (Phase 3, week 6).
 *
 * Sits on the outgoing message path of `Group.broadcast` / `Group.send`,
 * gates the message according to the configured mode, and either
 *   1. lets it through (mode='open'),
 *   2. queues it on the sender's device for the owner to approve
 *      (mode='owner-approved'), or
 *   3. asks the Shippie AI app's `moderate` micro-model first; flagged
 *      content holds for the owner, clean content broadcasts immediately
 *      (mode='ai-screened').
 *
 * Queues persist in OPFS so a reload doesn't lose pending messages. The
 * persistence shape is intentionally trivial JSON — we are NOT building
 * a database here, just a place for a few hundred small entries to live
 * across reload.
 *
 * Group key rotation: when the owner removes a member, we drop the
 * queue file and start fresh. Old envelopes encrypted under the old key
 * would be decrypt-failures anyway; better to clear them than to surface
 * dead entries in the moderation UI.
 *
 * --- Contract with the proximity package's `Group` API ---
 *
 * This module deliberately does NOT import `./group.ts` because the
 * parallel agent building the Group class hasn't landed it yet.
 * Instead, we accept anything that satisfies `GroupLike`:
 *
 *   interface GroupLike {
 *     id: string;
 *     ownerPeerId: PeerId;
 *     selfPeerId: PeerId;
 *     broadcast(channel: string, data: unknown): Promise<void> | void;
 *     send?(targetPeerId: PeerId, channel: string, data: unknown): Promise<void> | void;
 *     on?(event: 'member-removed', handler: (peerId: PeerId) => void): void;
 *   }
 *
 * If the merged `Group` shape diverges from this, only the adapter at
 * the bottom of this file (`attachModeration`) needs to change.
 *
 * --- Contract with the Shippie AI app ---
 *
 * `mode='ai-screened'` calls `shippie.local.ai.moderate(text)`. The
 * expected shape is:
 *
 *   interface ModerateResult {
 *     flagged: boolean;
 *     // 0..1 confidence; we don't act on anything below 0.75.
 *     score: number;
 *     // Optional categories ('toxic' | 'severe' | 'sexual' | ...).
 *     categories?: string[];
 *   }
 *
 * Failure of the AI call (iframe not installed, model load failure)
 * falls back to `mode='owner-approved'` semantics — better safe than
 * silently broadcasting unmoderated text.
 */

import type { PeerId } from './types.ts';

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type ModerationMode = 'open' | 'owner-approved' | 'ai-screened';

export interface ModerationDecision {
  flagged: boolean;
  /** Reason a message was held — only set when `flagged`. */
  reason?: 'mode-owner-approved' | 'mode-ai-flagged' | 'ai-unavailable';
  /** Categories from the moderation model, if any. */
  categories?: string[];
  /** AI score in 0..1, present when AI screening ran. */
  score?: number;
}

export interface PendingMessage {
  /** UUID for queue identity. */
  id: string;
  /** Peer who attempted to send (always selfPeerId on the sender's device). */
  author: PeerId;
  /** Group channel (e.g. 'chat', 'cursor', any maker-defined string). */
  channel: string;
  /** Stringified payload. We don't keep the raw object so the queue
   *  serializes cleanly to JSON regardless of payload type. */
  payloadJson: string;
  /** When the user attempted to send. ms since epoch. */
  ts: number;
  /** Why this message is in the queue. */
  reason: NonNullable<ModerationDecision['reason']>;
  /** Optional categories from the AI model. */
  categories?: string[];
  /** Optional AI score. */
  score?: number;
}

/** What a `GroupLike` only needs to expose for moderation to plug in. */
export interface GroupLike {
  id: string;
  ownerPeerId: PeerId;
  selfPeerId: PeerId;
  broadcast(channel: string, data: unknown): Promise<void> | void;
  send?(targetPeerId: PeerId, channel: string, data: unknown): Promise<void> | void;
  on?: (event: 'member-removed', handler: (peerId: PeerId) => void) => void;
}

/** Minimal AI moderate API — matches `shippie.local.ai.moderate`. */
export interface ModerateApi {
  moderate(text: string): Promise<{
    flagged: boolean;
    score: number;
    categories?: string[];
  }>;
}

/**
 * Storage adapter — defaults to OPFS in the browser. Tests inject an
 * in-memory adapter.
 */
export interface QueueStorage {
  read(): Promise<PendingMessage[]>;
  write(entries: PendingMessage[]): Promise<void>;
  /** Wipe — used on group key rotation / member-removed. */
  clear(): Promise<void>;
}

export interface ModerationHookOptions {
  /** Initial mode. Defaults to 'open'. */
  mode?: ModerationMode;
  /** Group instance to wrap. */
  group: GroupLike;
  /** AI moderate API; required for `ai-screened`. */
  ai?: ModerateApi;
  /** Storage — defaults to OPFS at `shippie/moderation/{groupId}.json`. */
  storage?: QueueStorage;
  /** Confidence threshold (0..1). Default 0.75. */
  flagThreshold?: number;
  /** Hook for UI: emitted whenever the queue changes. */
  onQueueChange?: (queue: PendingMessage[]) => void;
}

export interface ModerationHook {
  readonly groupId: string;
  readonly mode: ModerationMode;
  setMode(mode: ModerationMode): void;

  /**
   * Try to send a message. Resolves to a decision describing what
   * happened (broadcast, queued, or rejected).
   */
  send(channel: string, data: unknown): Promise<ModerationDecision>;

  /** Queue inspection (owner UI). */
  getQueue(): Promise<PendingMessage[]>;

  /** Owner approves: removes from queue and broadcasts. */
  approve(messageId: string): Promise<boolean>;

  /** Owner rejects: removes from queue, never broadcasts. */
  reject(messageId: string): Promise<boolean>;

  /**
   * Called from the Group key-rotation path when a member is removed.
   * Clears the moderation queue alongside the group key.
   */
  onMemberRemoved(removedPeerId: PeerId): Promise<void>;

  /** Detach listeners. */
  dispose(): void;
}

// ---------------------------------------------------------------------
// OPFS-backed storage (default)
// ---------------------------------------------------------------------

/**
 * OPFS adapter. Files under
 *   /shippie/moderation/{groupId}.json
 *
 * If OPFS isn't available (older Safari, SSR, tests without DOM), the
 * adapter falls back to an in-memory store — graceful degradation, but
 * the queue won't survive reload in that environment.
 */
export function createOpfsQueueStorage(groupId: string): QueueStorage {
  const path = `shippie-moderation-${sanitizeId(groupId)}.json`;
  const memFallback: { entries: PendingMessage[] } = { entries: [] };

  async function getDir(): Promise<FileSystemDirectoryHandle | null> {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (!nav?.storage?.getDirectory) return null;
    try {
      const root = await nav.storage.getDirectory();
      const dir = await root.getDirectoryHandle('shippie-moderation', { create: true });
      return dir;
    } catch {
      return null;
    }
  }

  return {
    async read() {
      const dir = await getDir();
      if (!dir) return [...memFallback.entries];
      try {
        const handle = await dir.getFileHandle(path, { create: false });
        const file = await handle.getFile();
        const text = await file.text();
        if (!text) return [];
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? (parsed as PendingMessage[]) : [];
      } catch {
        return [];
      }
    },
    async write(entries) {
      const dir = await getDir();
      if (!dir) {
        memFallback.entries = [...entries];
        return;
      }
      try {
        const handle = await dir.getFileHandle(path, { create: true });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(entries));
        await writable.close();
      } catch {
        memFallback.entries = [...entries];
      }
    },
    async clear() {
      memFallback.entries = [];
      const dir = await getDir();
      if (!dir) return;
      try {
        await dir.removeEntry(path);
      } catch {
        // Already gone — that's fine.
      }
    },
  };
}

/** In-memory storage — the default for tests. */
export function createMemoryQueueStorage(): QueueStorage {
  let entries: PendingMessage[] = [];
  return {
    async read() {
      return [...entries];
    },
    async write(next) {
      entries = [...next];
    },
    async clear() {
      entries = [];
    },
  };
}

// ---------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------

export function createModerationHook(opts: ModerationHookOptions): ModerationHook {
  const group = opts.group;
  let mode: ModerationMode = opts.mode ?? 'open';
  const ai = opts.ai;
  const storage = opts.storage ?? createOpfsQueueStorage(group.id);
  const threshold = opts.flagThreshold ?? 0.75;
  const onQueueChange = opts.onQueueChange;

  // Wire member-removed → queue clear, when the group exposes events.
  let detachMemberRemoved: (() => void) | null = null;
  if (typeof group.on === 'function') {
    const handler = (_peer: PeerId) => {
      void hook.onMemberRemoved(_peer);
    };
    group.on('member-removed', handler);
    // We don't have an off() in the GroupLike contract; this is a
    // best-effort dispose. If `on` returns a disposer in the eventual
    // Group API, this is where we'd capture it.
    detachMemberRemoved = () => {
      // no-op for now
    };
  }

  async function emitChange() {
    if (!onQueueChange) return;
    onQueueChange(await storage.read());
  }

  async function pushQueue(entry: PendingMessage) {
    const cur = await storage.read();
    cur.push(entry);
    await storage.write(cur);
    await emitChange();
  }

  async function popQueue(messageId: string): Promise<PendingMessage | null> {
    const cur = await storage.read();
    const idx = cur.findIndex((e) => e.id === messageId);
    if (idx < 0) return null;
    const [entry] = cur.splice(idx, 1);
    await storage.write(cur);
    await emitChange();
    return entry ?? null;
  }

  const hook: ModerationHook = {
    get groupId() {
      return group.id;
    },
    get mode() {
      return mode;
    },
    setMode(next) {
      mode = next;
    },

    async send(channel, data) {
      // ----- mode='open' -----
      if (mode === 'open') {
        await group.broadcast(channel, data);
        return { flagged: false };
      }

      // ----- mode='owner-approved' -----
      if (mode === 'owner-approved') {
        await pushQueue({
          id: makeId(),
          author: group.selfPeerId,
          channel,
          payloadJson: safeJson(data),
          ts: Date.now(),
          reason: 'mode-owner-approved',
        });
        return { flagged: true, reason: 'mode-owner-approved' };
      }

      // ----- mode='ai-screened' -----
      // Only string-ish payloads can be screened — anything else passes
      // straight through (cursor positions, drawing strokes, etc.).
      const text = extractText(data);
      if (text === null) {
        await group.broadcast(channel, data);
        return { flagged: false };
      }
      if (!ai) {
        // No AI bound but mode is ai-screened — fail closed: queue it.
        await pushQueue({
          id: makeId(),
          author: group.selfPeerId,
          channel,
          payloadJson: safeJson(data),
          ts: Date.now(),
          reason: 'ai-unavailable',
        });
        return { flagged: true, reason: 'ai-unavailable' };
      }
      let result: { flagged: boolean; score: number; categories?: string[] };
      try {
        result = await ai.moderate(text);
      } catch {
        await pushQueue({
          id: makeId(),
          author: group.selfPeerId,
          channel,
          payloadJson: safeJson(data),
          ts: Date.now(),
          reason: 'ai-unavailable',
        });
        return { flagged: true, reason: 'ai-unavailable' };
      }

      if (result.flagged && result.score >= threshold) {
        await pushQueue({
          id: makeId(),
          author: group.selfPeerId,
          channel,
          payloadJson: safeJson(data),
          ts: Date.now(),
          reason: 'mode-ai-flagged',
          categories: result.categories,
          score: result.score,
        });
        return {
          flagged: true,
          reason: 'mode-ai-flagged',
          categories: result.categories,
          score: result.score,
        };
      }

      await group.broadcast(channel, data);
      return { flagged: false, score: result.score, categories: result.categories };
    },

    async getQueue() {
      return storage.read();
    },

    async approve(messageId) {
      const entry = await popQueue(messageId);
      if (!entry) return false;
      let payload: unknown;
      try {
        payload = JSON.parse(entry.payloadJson);
      } catch {
        payload = entry.payloadJson;
      }
      await group.broadcast(entry.channel, payload);
      return true;
    },

    async reject(messageId) {
      const entry = await popQueue(messageId);
      return entry !== null;
    },

    async onMemberRemoved(_removedPeerId) {
      // Group key rotates → moderation queue rotates with it. Old
      // entries can't be decrypted by the new membership anyway.
      await storage.clear();
      await emitChange();
    },

    dispose() {
      detachMemberRemoved?.();
      detachMemberRemoved = null;
    },
  };

  return hook;
}

// ---------------------------------------------------------------------
// Convenience adapter — wraps a Group so callers can use it transparently.
// ---------------------------------------------------------------------

/**
 * Returns a function `moderatedBroadcast(channel, data)` that callers
 * can drop in wherever they used to call `group.broadcast`. This keeps
 * the moderation pass invisible to maker code — the SDK swaps the
 * function based on the configured mode.
 */
export function attachModeration(opts: ModerationHookOptions): {
  hook: ModerationHook;
  broadcast: (channel: string, data: unknown) => Promise<ModerationDecision>;
} {
  const hook = createModerationHook(opts);
  return {
    hook,
    broadcast: (channel, data) => hook.send(channel, data),
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function makeId(): string {
  // Prefer crypto.randomUUID; fall back for very old runtimes.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function extractText(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.body === 'string') return obj.body;
  }
  return null;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}
