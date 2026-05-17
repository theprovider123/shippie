/**
 * The Hearth Y.Doc — every piece of shared state lives in here, in
 * its own namespace.
 *
 * Three layers, all bound here:
 *  1. y-indexeddb persistence — keeps a copy on each device.
 *  2. BroadcastChannel cross-tab sync — same-origin only, free; lets
 *     two browser windows on the same machine sync live (helpful for
 *     dev/demo with multiple "housemates" in different tabs).
 *  3. RelayProvider cross-device sync — opens a WebSocket to the
 *     Shippie SignalRoom DO and fans out E2E-encrypted Y updates to
 *     all paired housemates. N-party — works for any number of
 *     housemates on any network topology.
 *
 * Shape:
 *  - `meta` Y.Map           created_at, plus arbitrary house metadata
 *  - `members` Y.Map        memberId -> { name, joined_at } — observable
 *                           presence; each housemate writes their own row.
 *  - `chores` Y.Array       { id, label, cadence, last_done_at, last_done_by, rota_index }
 *  - `rota` Y.Map           keyed by chore id -> { members: [...], cursor }
 *  - `fridge` Y.Array       { id, label, added_at, added_by, qty_text }
 *  - `dinner_history` Y.Array { id, label, eaten_at, who_cooked? }
 *
 * E2E: every relay frame is AES-GCM encrypted with a key derived from
 * the encryption phrase via PBKDF2 (see crypto.ts). The DO sees
 * ciphertext + nonce, never plaintext.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  decrypt,
  deriveKey,
  encrypt,
  packFrame,
  unpackFrame,
} from './crypto.ts';
import { bindRelayProvider, type RelayProvider } from './relay-provider.ts';

// ── Domain types ───────────────────────────────────────────────────

export type Cadence = 'weekly' | 'fortnightly' | 'monthly';

export interface Chore {
  id: string;
  label: string;
  cadence: Cadence;
  /** Wall-clock ms or null if never done. */
  last_done_at: number | null;
  /** memberId of last person to mark it done, or null. */
  last_done_by: string | null;
  /** Persisted rota index pointer at the time of last_done. Advisory; the
   *  authoritative cursor lives in the rota map. Kept here for log/UI. */
  rota_index: number;
}

export interface RotaEntry {
  /** Ordered list of memberIds to rotate through. */
  members: string[];
  /** Index into `members` whose turn is NEXT. Advances on `markChoreDone`. */
  cursor: number;
}

export interface FridgeItem {
  id: string;
  label: string;
  added_at: number;
  /** memberId of the person who added it. */
  added_by: string;
  /** Free-text quantity. "half a leek", "6 eggs", "2 left". Not parsed. */
  qty_text: string;
}

export interface DinnerEntry {
  id: string;
  label: string;
  eaten_at: number;
  /** memberId, or null if no one claimed cooking it. */
  who_cooked: string | null;
}

export interface HouseMember {
  name: string;
  joined_at: number;
}

// ── Doc helpers ────────────────────────────────────────────────────

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function getMembers(doc: Y.Doc): Y.Map<HouseMember> {
  return doc.getMap<HouseMember>('members');
}

export function getChores(doc: Y.Doc): Y.Array<Chore> {
  return doc.getArray<Chore>('chores');
}

export function getRota(doc: Y.Doc): Y.Map<RotaEntry> {
  return doc.getMap<RotaEntry>('rota');
}

export function getFridge(doc: Y.Doc): Y.Array<FridgeItem> {
  return doc.getArray<FridgeItem>('fridge');
}

export function getDinnerHistory(doc: Y.Doc): Y.Array<DinnerEntry> {
  return doc.getArray<DinnerEntry>('dinner_history');
}

// ── Local id minting ───────────────────────────────────────────────
//
// IDs need to be unique across all housemates, so we mint them with
// crypto.getRandomValues — Y's CRDT will dedupe identical objects in
// the rare event of a collision, but uniqueness keeps the indexes
// simple.

function mintId(prefix: string): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = prefix + '_';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// ── Member presence ────────────────────────────────────────────────

export function announceMember(
  doc: Y.Doc,
  memberId: string,
  name: string,
): void {
  const members = getMembers(doc);
  const existing = members.get(memberId);
  if (existing) {
    if (existing.name !== name) {
      members.set(memberId, { name, joined_at: existing.joined_at });
    }
    return;
  }
  members.set(memberId, { name, joined_at: Date.now() });
}

export function listMembers(doc: Y.Doc): Array<{ id: string; member: HouseMember }> {
  const out: Array<{ id: string; member: HouseMember }> = [];
  for (const [id, m] of getMembers(doc).entries()) {
    out.push({ id, member: m });
  }
  out.sort((a, b) => a.member.joined_at - b.member.joined_at);
  return out;
}

// ── Chores + rota ──────────────────────────────────────────────────

export interface AddChoreInput {
  label: string;
  cadence: Cadence;
  /** Initial rota — pass the current member ids in the order you want them. */
  rotaMembers: string[];
}

export function addChore(doc: Y.Doc, input: AddChoreInput): Chore {
  const id = mintId('chore');
  const chore: Chore = {
    id,
    label: input.label.trim(),
    cadence: input.cadence,
    last_done_at: null,
    last_done_by: null,
    rota_index: 0,
  };
  doc.transact(() => {
    getChores(doc).push([chore]);
    getRota(doc).set(id, { members: [...input.rotaMembers], cursor: 0 });
  });
  return chore;
}

/** Replace a chore's rota members + reset cursor to 0 (least-surprise). */
export function setRotaMembers(doc: Y.Doc, choreId: string, members: string[]): void {
  const rota = getRota(doc);
  const existing = rota.get(choreId);
  rota.set(choreId, { members: [...members], cursor: existing && existing.members.length > 0 ? Math.min(existing.cursor, members.length - 1) : 0 });
}

export function removeChore(doc: Y.Doc, choreId: string): void {
  doc.transact(() => {
    const chores = getChores(doc);
    for (let i = 0; i < chores.length; i++) {
      const c = chores.get(i);
      if (c?.id === choreId) {
        chores.delete(i, 1);
        break;
      }
    }
    getRota(doc).delete(choreId);
  });
}

/**
 * Mark a chore done by a member. Advances the rota cursor by 1 (mod
 * length) so "whose turn" rotates fairly. Updates the chore's last_*
 * fields so the UI can show "last done by Alex on Tuesday".
 */
export function markChoreDone(doc: Y.Doc, choreId: string, memberId: string, when = Date.now()): void {
  const chores = getChores(doc);
  doc.transact(() => {
    for (let i = 0; i < chores.length; i++) {
      const c = chores.get(i);
      if (c?.id !== choreId) continue;

      const rota = getRota(doc).get(choreId);
      const length = rota?.members.length ?? 0;
      const nextCursor = length > 0 ? (rota!.cursor + 1) % length : 0;

      // Replace the chore object with an updated copy. (Yjs arrays
      // can't mutate-in-place; delete + insert is the canonical pattern.)
      chores.delete(i, 1);
      chores.insert(i, [
        {
          ...c,
          last_done_at: when,
          last_done_by: memberId,
          rota_index: nextCursor,
        },
      ]);

      if (rota) {
        getRota(doc).set(choreId, { members: rota.members, cursor: nextCursor });
      }
      break;
    }
  });
}

// ── Fridge ─────────────────────────────────────────────────────────

export interface AddFridgeInput {
  label: string;
  qty_text: string;
  added_by: string;
}

export function addFridgeItem(doc: Y.Doc, input: AddFridgeInput): FridgeItem {
  const item: FridgeItem = {
    id: mintId('fridge'),
    label: input.label.trim(),
    qty_text: input.qty_text.trim(),
    added_at: Date.now(),
    added_by: input.added_by,
  };
  getFridge(doc).push([item]);
  return item;
}

export function removeFridgeItem(doc: Y.Doc, itemId: string): void {
  const fridge = getFridge(doc);
  for (let i = 0; i < fridge.length; i++) {
    if (fridge.get(i)?.id === itemId) {
      fridge.delete(i, 1);
      break;
    }
  }
}

// ── Dinner history ─────────────────────────────────────────────────

export interface RecordDinnerInput {
  label: string;
  who_cooked?: string | null;
  /** Override eaten_at; defaults to now. */
  eaten_at?: number;
}

/**
 * Record a dinner. Idempotent on (label, calendar-day, who_cooked):
 * if Recipe app fires `cooked-meal` after a housemate also clicks
 * "Mark cooked" in the dinner picker, we don't double-log. Idempotency
 * key is the lowercased label + the day bucket of eaten_at.
 */
export function recordDinner(doc: Y.Doc, input: RecordDinnerInput): DinnerEntry {
  const eaten_at = input.eaten_at ?? Date.now();
  const dayBucket = Math.floor(eaten_at / 86_400_000);
  const labelKey = input.label.trim().toLowerCase();

  const history = getDinnerHistory(doc);
  for (let i = 0; i < history.length; i++) {
    const e = history.get(i);
    if (!e) continue;
    if (
      e.label.trim().toLowerCase() === labelKey &&
      Math.floor(e.eaten_at / 86_400_000) === dayBucket
    ) {
      return e; // already logged this dinner today
    }
  }
  const entry: DinnerEntry = {
    id: mintId('dinner'),
    label: input.label.trim(),
    eaten_at,
    who_cooked: input.who_cooked ?? null,
  };
  history.push([entry]);
  return entry;
}

// ── Cross-tab + cross-device wiring ────────────────────────────────

export interface BoundHearthDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
  /** Live cross-device relay status; null when no phrase passed. */
  relay: RelayProvider | null;
  destroy: () => void;
}

/**
 * Bind the Hearth Y.Doc to local persistence + an encrypted cross-tab
 * channel + (when phrase is passed) the cross-device relay.
 */
export function bindHearthDoc(roomSlug: string, phrase?: string): BoundHearthDoc {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(roomSlug, doc);
  const whenSynced = new Promise<void>((resolve) => {
    persistence.once('synced', () => resolve());
  });

  let channel: BroadcastChannel | null = null;
  let outboundQueue: Uint8Array[] = [];
  let key: CryptoKey | null = null;
  let keyReady: Promise<void> | null = null;

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(`hearth:${roomSlug}`);

    if (phrase) {
      keyReady = deriveKey(phrase).then((k) => {
        key = k;
        const pending = outboundQueue;
        outboundQueue = [];
        for (const u of pending) void send(u);
      });
    }

    channel.onmessage = async (event) => {
      try {
        const data = new Uint8Array(event.data as ArrayBuffer);
        if (key) {
          const frame = unpackFrame(data);
          const update = await decrypt(key, frame);
          Y.applyUpdate(doc, update, 'remote-tab');
        } else if (!phrase) {
          Y.applyUpdate(doc, data, 'remote-tab');
        }
      } catch {
        // malformed or wrong-key — ignore.
      }
    };

    async function send(update: Uint8Array): Promise<void> {
      if (!channel) return;
      if (!phrase) {
        channel.postMessage(update.buffer);
        return;
      }
      if (!key) {
        outboundQueue.push(update);
        return;
      }
      const frame = await encrypt(key, update);
      const packed = packFrame(frame);
      channel.postMessage(packed.buffer);
    }

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote-tab') return;
      void send(update);
    });
  }

  let relay: RelayProvider | null = null;
  if (phrase && typeof WebSocket !== 'undefined') {
    relay = bindRelayProvider({ doc, roomSlug, phrase });
  }

  return {
    doc,
    persistence,
    relay,
    whenSynced: keyReady ? Promise.all([whenSynced, keyReady]).then(() => {}) : whenSynced,
    destroy: () => {
      relay?.destroy();
      channel?.close();
      void persistence.destroy();
      doc.destroy();
    },
  };
}

export type { Doc as YDoc } from 'yjs';
