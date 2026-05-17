/**
 * The Tab Y.Doc — every piece of shared state lives in here.
 *
 * Three layers, all bound here:
 *  1. y-indexeddb persistence — keeps a copy on each device, so the
 *     tab survives tab-close.
 *  2. BroadcastChannel cross-tab sync — same-origin only, free; lets
 *     two browser windows on the same machine sync live (helpful for
 *     dev/demo with multiple "diners" in different tabs).
 *  3. RelayProvider cross-device sync — opens a WebSocket to the
 *     Shippie SignalRoom DO and fans out E2E-encrypted Y updates to
 *     all paired diners. N-party — works for any number of diners on
 *     any network topology.
 *
 * Shape:
 *  - `meta` Y.Map           created_at, currency, label
 *  - `members` Y.Map        memberId -> { name, joined_at } — observable
 *                           presence; each diner writes their own row.
 *  - `items` Y.Array        { id, label, amount_cents, paid_by, split_among, created_at }
 *                           split_among empty array = split among ALL current members.
 *  - `settlements` Y.Array  { id, from, to, amount_cents, settled_at }
 *                           manual records of "I gave you cash for my share".
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

export interface TabMeta {
  created_at: number;
  currency: string;
  label: string;
}

export interface TabMember {
  name: string;
  joined_at: number;
}

export interface TabItem {
  id: string;
  label: string;
  amount_cents: number;
  paid_by: string;
  /** Empty array = split among ALL current members. */
  split_among: string[];
  created_at: number;
}

export interface Settlement {
  id: string;
  from: string;
  to: string;
  amount_cents: number;
  settled_at: number;
}

// ── Doc helpers ────────────────────────────────────────────────────

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function getMembers(doc: Y.Doc): Y.Map<TabMember> {
  return doc.getMap<TabMember>('members');
}

export function getItems(doc: Y.Doc): Y.Array<TabItem> {
  return doc.getArray<TabItem>('items');
}

export function getSettlements(doc: Y.Doc): Y.Array<Settlement> {
  return doc.getArray<Settlement>('settlements');
}

// ── Local id minting ───────────────────────────────────────────────

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

// ── Meta ───────────────────────────────────────────────────────────

export interface SetMetaInput {
  currency?: string;
  label?: string;
}

/** Initialise meta if empty; otherwise apply only the supplied fields. */
export function ensureMeta(doc: Y.Doc, defaults: { currency: string; label: string }): TabMeta {
  const meta = getMeta(doc);
  const current = readMeta(doc);
  if (!current) {
    const fresh: TabMeta = {
      created_at: Date.now(),
      currency: defaults.currency,
      label: defaults.label,
    };
    doc.transact(() => {
      meta.set('created_at', fresh.created_at);
      meta.set('currency', fresh.currency);
      meta.set('label', fresh.label);
    });
    return fresh;
  }
  return current;
}

export function readMeta(doc: Y.Doc): TabMeta | null {
  const m = getMeta(doc);
  const created_at = m.get('created_at');
  const currency = m.get('currency');
  const label = m.get('label');
  if (typeof created_at !== 'number') return null;
  return {
    created_at,
    currency: typeof currency === 'string' ? currency : 'GBP',
    label: typeof label === 'string' ? label : '',
  };
}

export function updateMeta(doc: Y.Doc, input: SetMetaInput): void {
  const meta = getMeta(doc);
  doc.transact(() => {
    if (input.currency !== undefined) meta.set('currency', input.currency);
    if (input.label !== undefined) meta.set('label', input.label);
  });
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

export function removeMember(doc: Y.Doc, memberId: string): void {
  getMembers(doc).delete(memberId);
}

export function listMembers(doc: Y.Doc): Array<{ id: string; member: TabMember }> {
  const out: Array<{ id: string; member: TabMember }> = [];
  for (const [id, m] of getMembers(doc).entries()) {
    out.push({ id, member: m });
  }
  out.sort((a, b) => a.member.joined_at - b.member.joined_at);
  return out;
}

// ── Items ──────────────────────────────────────────────────────────

export interface AddItemInput {
  label: string;
  amount_cents: number;
  paid_by: string;
  /** Empty array (default) = split among ALL current members at compute time. */
  split_among?: string[];
}

export function addItem(doc: Y.Doc, input: AddItemInput): TabItem {
  const item: TabItem = {
    id: mintId('item'),
    label: input.label.trim(),
    amount_cents: Math.round(input.amount_cents),
    paid_by: input.paid_by,
    split_among: [...(input.split_among ?? [])],
    created_at: Date.now(),
  };
  getItems(doc).push([item]);
  return item;
}

export function removeItem(doc: Y.Doc, itemId: string): void {
  const items = getItems(doc);
  for (let i = 0; i < items.length; i++) {
    if (items.get(i)?.id === itemId) {
      items.delete(i, 1);
      return;
    }
  }
}

// ── Settlements ────────────────────────────────────────────────────

export interface RecordSettlementInput {
  from: string;
  to: string;
  amount_cents: number;
}

export function recordSettlement(doc: Y.Doc, input: RecordSettlementInput): Settlement {
  const entry: Settlement = {
    id: mintId('settle'),
    from: input.from,
    to: input.to,
    amount_cents: Math.round(input.amount_cents),
    settled_at: Date.now(),
  };
  getSettlements(doc).push([entry]);
  return entry;
}

// ── Cross-tab + cross-device wiring ────────────────────────────────

export interface BoundTabDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
  /** Live cross-device relay status; null when no phrase passed. */
  relay: RelayProvider | null;
  destroy: () => void;
}

/**
 * Bind the Tab Y.Doc to local persistence + an encrypted cross-tab
 * channel + (when phrase is passed) the cross-device relay.
 */
export function bindTabDoc(roomSlug: string, phrase?: string): BoundTabDoc {
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
    channel = new BroadcastChannel(`tab:${roomSlug}`);

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
