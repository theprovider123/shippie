import {
  createIndexedDbDocumentStore,
  createLocalStorageDocumentStore,
  createSealedSyncClient,
  generateDeviceSigningKeyPair,
  openDocument,
  type DeviceSigningKeyPair,
  type DocumentAccessBundle,
  type DocumentHandle,
} from '@shippie/doc';
import { sha256Base64Url } from '@shippie/spaces';
import { emptyArchiveState, reduceMatchRoomArchive } from './matchday-state.ts';
import {
  readCommentaryPosts,
  readFollowedTeam,
  readPredictionReceipts,
  readPulseVote,
  readSavedRooms,
  type PulseVote,
} from './local-store.ts';
import type { MatchRoomArchiveState, MatchdayPayload } from './types.ts';

export interface RoomDocumentRuntime {
  documentId: string;
  state(): MatchRoomArchiveState;
  pendingCount(): number;
  lastSyncedAt(): number | null;
  accessBundle(): DocumentAccessBundle;
  append(payload: MatchdayPayload): Promise<void>;
  sync(): Promise<{ pushed: number; pulled: number }>;
}

const SIGNING_KEY_PREFIX = 'shippie.matchRoom.document.signing.v1';

export async function openMatchRoomDocument(opts: {
  roomId: string;
  roomKey: string;
  peerId: string;
  fetchImpl?: typeof fetch;
}): Promise<RoomDocumentRuntime> {
  const documentId = documentIdForRoom(opts.roomId);
  const signing = await signingForPeer(opts.peerId);
  const documentKey = await documentKeyFromRoomKey(opts.roomKey);
  const store = createBrowserDocumentStore('shippie.matchRoom.document.v1');
  const sync = createSealedSyncClient({
    fetchImpl: opts.fetchImpl ?? globalThis.fetch?.bind(globalThis),
  });
  const handle = await openDocument<MatchRoomArchiveState, MatchdayPayload>({
    documentId,
    documentKey,
    signing,
    store,
    sync,
    realtime: {
      pushDebounceMs: 80,
      pullIntervalMs: 1_000,
      idlePullIntervalMs: 15_000,
      maxBackoffMs: 30_000,
    },
    initialState: emptyArchiveState(),
    reducer: (state, event) => reduceMatchRoomArchive(state, event.payload),
  });
  await migrateLegacyLocalState(handle, opts.roomId);

  return {
    documentId,
    state: () => handle.state(),
    pendingCount: () => handle.pendingEventIds().length,
    lastSyncedAt: () => {
      const value = handle.syncStatus().lastSyncedAt;
      return value ? Date.parse(value) : null;
    },
    accessBundle: () => ({
      schema: 'shippie.document.access-bundle.v1',
      createdAt: new Date().toISOString(),
      deviceLabel: 'Match Room device',
      documents: [{
        documentId,
        documentKey,
        cursor: handle.cursor(),
        role: 'room-member',
      }],
    }),
    append: (payload) => appendPayload(handle, payload),
    async sync() {
      try {
        const result = await handle.sync();
        return { pushed: result.pushed, pulled: result.pulled };
      } catch {
        return { pushed: 0, pulled: 0 };
      }
    },
  };
}

async function migrateLegacyLocalState(
  handle: DocumentHandle<MatchRoomArchiveState, MatchdayPayload>,
  roomId: string,
): Promise<void> {
  const storage = safeLocalStorage();
  if (!storage) return;
  const migrationKey = `shippie.matchRoom.document.migration.v1:${roomId}`;
  if (storage.getItem(migrationKey)) return;

  const receipts = readPredictionReceipts(storage);
  const savedRooms = readSavedRooms(storage);
  const followedTeam = readFollowedTeam(storage);
  const commentaryPosts = readCommentaryPosts(storage);
  const pulseVotes = ['opening-room-mood', 'opening-confidence', 'opening-snack']
    .map((questionId) => readPulseVote(questionId, storage))
    .filter((item): item is PulseVote => item !== null);

  if (!receipts.length && !savedRooms.length && !followedTeam && !commentaryPosts.length && !pulseVotes.length) {
    storage.setItem(migrationKey, new Date().toISOString());
    return;
  }

  await appendPayload(handle, {
    kind: 'legacy-local-snapshot',
    snapshot: {
      schema: 'shippie.match-room.legacy-local-snapshot.v1',
      roomId,
      migratedAt: new Date().toISOString(),
      receipts,
      savedRooms,
      followedTeam,
      commentaryPosts,
      pulseVotes,
    },
  });
  storage.setItem(migrationKey, new Date().toISOString());
}

async function appendPayload(
  handle: DocumentHandle<MatchRoomArchiveState, MatchdayPayload>,
  payload: MatchdayPayload,
): Promise<void> {
  const eventId = `evt_${await sha256Base64Url(stableStringify(payload))}`;
  if (handle.events().some((event) => event.eventId === eventId)) return;
  await handle.append({
    kind: payload.kind,
    payload,
    eventId,
    createdAt: createdAtForPayload(payload),
  });
}

function documentIdForRoom(roomId: string): string {
  return `matchroom_${roomId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

async function documentKeyFromRoomKey(roomKey: string): Promise<string> {
  return sha256Base64Url(`match-room-document:${roomKey}`);
}

async function signingForPeer(peerId: string): Promise<DeviceSigningKeyPair> {
  const storage = safeLocalStorage();
  const key = `${SIGNING_KEY_PREFIX}:${peerId}`;
  if (storage) {
    const raw = storage.getItem(key);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as { publicJwk: JsonWebKey; privateJwk: JsonWebKey; publicKeySpki: string; deviceId: string };
        const publicKey = await crypto.subtle.importKey('jwk', saved.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
        const privateKey = await crypto.subtle.importKey('jwk', saved.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
        return { deviceId: saved.deviceId, publicKey, privateKey, publicKeySpki: saved.publicKeySpki };
      } catch {
        storage.removeItem(key);
      }
    }
  }

  const generated = await generateDeviceSigningKeyPair();
  if (storage) {
    const [publicJwk, privateJwk] = await Promise.all([
      crypto.subtle.exportKey('jwk', generated.publicKey),
      crypto.subtle.exportKey('jwk', generated.privateKey),
    ]);
    storage.setItem(key, JSON.stringify({
      deviceId: generated.deviceId,
      publicKeySpki: generated.publicKeySpki,
      publicJwk,
      privateJwk,
    }));
  }
  return generated;
}

function createBrowserDocumentStore(namespace: string) {
  try {
    if (typeof indexedDB !== 'undefined') return createIndexedDbDocumentStore({ namespace });
  } catch {
    // Fall through to localStorage for older/private browser contexts.
  }
  return createLocalStorageDocumentStore({ namespace });
}

function createdAtForPayload(payload: MatchdayPayload): string {
  const ts = 'ts' in payload ? payload.ts : 'vote' in payload ? payload.vote.ts : 'poll' in payload ? payload.poll.createdAt : Date.now();
  return new Date(ts).toISOString();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = sortValue(record[key]);
  return out;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
