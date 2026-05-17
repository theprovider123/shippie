export const SHIPPIE_DOCUMENT_EVENT_SCHEMA = 'shippie.document.event.v1' as const;
export const SHIPPIE_ENCRYPTED_EVENT_SCHEMA = 'shippie.document.encrypted-event.v1' as const;
export const SHIPPIE_DOCUMENT_SNAPSHOT_SCHEMA = 'shippie.document.snapshot.v1' as const;
export const SHIPPIE_ENCRYPTED_SNAPSHOT_SCHEMA = 'shippie.document.encrypted-snapshot.v1' as const;
export const SHIPPIE_ENCRYPTED_ATTACHMENT_SCHEMA = 'shippie.document.encrypted-attachment.v1' as const;
export const SHIPPIE_ENCRYPTED_ATTACHMENT_MANIFEST_SCHEMA = 'shippie.document.encrypted-attachment-manifest.v1' as const;

export type DocumentCipher = 'AES-256-GCM';
export type DocumentSignatureAlg = 'ECDSA-P256-SHA256';

export interface DocumentEvent<TPayload = unknown> {
  schema: typeof SHIPPIE_DOCUMENT_EVENT_SCHEMA;
  documentId: string;
  eventId: string;
  parentIds: string[];
  authorDeviceId: string;
  createdAt: string;
  kind: string;
  payload: TPayload;
}

export interface SignedDocumentEvent<TPayload = unknown> {
  event: DocumentEvent<TPayload>;
  authorPublicKey: string;
  signatureAlg: DocumentSignatureAlg;
  signature: string;
}

export interface EncryptedDocumentEvent {
  schema: typeof SHIPPIE_ENCRYPTED_EVENT_SCHEMA;
  documentId: string;
  eventId: string;
  parentIds: string[];
  authorDeviceId: string;
  authorPublicKey: string;
  createdAt: string;
  cipher: DocumentCipher;
  signatureAlg: DocumentSignatureAlg;
  nonce: string;
  ciphertext: string;
}

export interface DocumentSnapshot<TState = unknown> {
  schema: typeof SHIPPIE_DOCUMENT_SNAPSHOT_SCHEMA;
  documentId: string;
  snapshotId: string;
  authorDeviceId: string;
  createdAt: string;
  reducerVersion?: string | undefined;
  lastEventId: string | null;
  lastEventCreatedAt: string | null;
  eventCount: number;
  state: TState;
}

export interface SignedDocumentSnapshot<TState = unknown> {
  snapshot: DocumentSnapshot<TState>;
  authorPublicKey: string;
  signatureAlg: DocumentSignatureAlg;
  signature: string;
}

export interface EncryptedDocumentSnapshot {
  schema: typeof SHIPPIE_ENCRYPTED_SNAPSHOT_SCHEMA;
  documentId: string;
  snapshotId: string;
  authorDeviceId: string;
  authorPublicKey: string;
  createdAt: string;
  reducerVersion?: string | undefined;
  lastEventId: string | null;
  lastEventCreatedAt: string | null;
  eventCount: number;
  cipher: DocumentCipher;
  signatureAlg: DocumentSignatureAlg;
  nonce: string;
  ciphertext: string;
}

export interface EncryptedAttachmentPayload {
  schema: typeof SHIPPIE_ENCRYPTED_ATTACHMENT_SCHEMA;
  cipher: DocumentCipher;
  nonce: string;
  ciphertext: string;
  byteLength: number;
  contentType?: string | undefined;
  createdAt: string;
}

export interface EncryptedAttachmentManifest {
  schema: typeof SHIPPIE_ENCRYPTED_ATTACHMENT_MANIFEST_SCHEMA;
  attachmentId: string;
  createdAt: string;
  totalByteLength: number;
  contentType?: string | undefined;
  sha256?: string | undefined;
  chunks: Array<{
    attachmentId: string;
    byteLength: number;
    sha256?: string | undefined;
  }>;
}

export interface DeviceSigningKeyPair {
  deviceId: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeySpki: string;
}

export interface AccessTransferKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeySpki: string;
}

export interface DocumentAccessBundle {
  schema: 'shippie.document.access-bundle.v1';
  createdAt: string;
  documents: Array<{
    documentId: string;
    documentKey: string;
    cursor?: string | null | undefined;
    role?: string | undefined;
  }>;
  deviceLabel?: string | undefined;
}

export interface WrappedAccessBundle {
  schema: 'shippie.document.wrapped-access-bundle.v1';
  alg: 'ECDH-P256-AES-256-GCM';
  senderPublicKey: string;
  nonce: string;
  ciphertext: string;
}

export interface AccessTransferRequest {
  schema: 'shippie.document.access-transfer-request.v1';
  recipientPublicKey: string;
  createdAt: string;
  deviceLabel?: string | undefined;
}

export interface EncryptDocumentEventInput<TPayload = unknown> {
  documentId: string;
  documentKey: string | CryptoKey;
  signing: DeviceSigningKeyPair;
  kind: string;
  payload: TPayload;
  parentIds?: readonly string[] | undefined;
  createdAt?: string | undefined;
  eventId?: string | undefined;
}

export interface WrapAccessBundleInput {
  recipientPublicKeySpki: string;
  bundle: DocumentAccessBundle;
}

export interface UnwrapAccessBundleInput {
  recipientPrivateKey: CryptoKey;
  wrapped: WrappedAccessBundle;
}

export interface DecryptDocumentEventInput {
  documentKey: string | CryptoKey;
  envelope: EncryptedDocumentEvent;
}

export interface EncryptDocumentSnapshotInput<TState = unknown> {
  documentId: string;
  documentKey: string | CryptoKey;
  signing: DeviceSigningKeyPair;
  state: TState;
  lastEventId?: string | null | undefined;
  lastEventCreatedAt?: string | null | undefined;
  eventCount: number;
  reducerVersion?: string | undefined;
  createdAt?: string | undefined;
  snapshotId?: string | undefined;
}

export interface DecryptDocumentSnapshotInput {
  documentKey: string | CryptoKey;
  envelope: EncryptedDocumentSnapshot;
}

export interface EncryptAttachmentInput {
  documentKey: string | CryptoKey;
  bytes: Blob | Uint8Array | ArrayBuffer;
  contentType?: string | undefined;
  createdAt?: string | undefined;
}

export interface DecryptAttachmentInput {
  documentKey: string | CryptoKey;
  payload: EncryptedAttachmentPayload;
}

export type SealedSyncFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SealedSyncClientOptions {
  /**
   * Origin/base URL for the Shippie sealed cloud. Omit for same-origin
   * browser use inside the wrapped app.
   */
  origin?: string | undefined;
  fetchImpl?: SealedSyncFetch;
  headers?: HeadersInit | undefined;
}

export interface SealedEventPage {
  events: EncryptedDocumentEvent[];
  cursor: string | null;
  truncated: boolean;
}

export interface SealedEventPushResult {
  key: string;
  cursor: string;
  stored: boolean;
}

export interface SealedEventBatchPushResult {
  events: SealedEventPushResult[];
  stored: number;
  cursor: string | null;
}

export interface SealedAttachmentPushResult {
  key: string;
  stored: boolean;
  byteLength: number;
}

export interface SealedSnapshotPage {
  snapshots: EncryptedDocumentSnapshot[];
  cursor: string | null;
  truncated: boolean;
}

export interface SealedSnapshotPushResult {
  key: string;
  cursor: string;
  stored: boolean;
}

export interface SealedDocumentManifest {
  schema: 'shippie.document.manifest.v1';
  documentId: string;
  eventCount: number;
  snapshotCount: number;
  attachmentCount: number;
  latestEventId: string | null;
  latestEventCursor: string | null;
  latestSnapshotId: string | null;
  latestSnapshotCursor: string | null;
  lastAttachmentId: string | null;
  updatedAt: string | null;
}

export interface SealedDocumentChangeHint {
  schema: 'shippie.document.change-hint.v1';
  documentId: string;
  eventCount: number;
  snapshotCount: number;
  attachmentCount: number;
  latestEventId: string | null;
  latestEventCursor: string | null;
  latestSnapshotId: string | null;
  latestSnapshotCursor: string | null;
  updatedAt: string | null;
  changed: boolean;
}

export interface SealedChangeStreamHandle {
  close(): void;
}

export interface SealedSyncClient {
  pushEvent(event: EncryptedDocumentEvent): Promise<SealedEventPushResult>;
  pushEvents?(documentId: string, events: readonly EncryptedDocumentEvent[]): Promise<SealedEventBatchPushResult>;
  pullEvents(documentId: string, opts?: { cursor?: string | null; limit?: number }): Promise<SealedEventPage>;
  pushSnapshot?(snapshot: EncryptedDocumentSnapshot): Promise<SealedSnapshotPushResult>;
  pullSnapshots?(documentId: string, opts?: { cursor?: string | null; limit?: number }): Promise<SealedSnapshotPage>;
  pullLatestSnapshot?(documentId: string): Promise<EncryptedDocumentSnapshot | null>;
  getManifest?(documentId: string): Promise<SealedDocumentManifest>;
  getChangeHint?(documentId: string, opts?: {
    eventCursor?: string | null;
    snapshotCursor?: string | null;
    eventCount?: number;
    snapshotCount?: number;
  }): Promise<SealedDocumentChangeHint>;
  watchChangeHint?(documentId: string, opts: {
    eventCursor?: string | null;
    snapshotCursor?: string | null;
    eventCount?: number;
    snapshotCount?: number;
    timeoutMs?: number;
    intervalMs?: number;
    onChange: (hint: SealedDocumentChangeHint) => void;
    onError?: (error: unknown) => void;
  }): SealedChangeStreamHandle | null;
  pushAttachment(
    documentId: string,
    attachmentId: string,
    bytes: Blob | Uint8Array | ArrayBuffer,
    opts?: { contentType?: string },
  ): Promise<SealedAttachmentPushResult>;
  pullAttachment(documentId: string, attachmentId: string): Promise<Blob>;
}

export interface AccessTransferRelayClient {
  putRequest(transferId: string, request: AccessTransferRequest): Promise<{ transferId: string; stored: true; expiresIn: number }>;
  getRequest(transferId: string): Promise<AccessTransferRequest | null>;
  putBundle(transferId: string, bundle: WrappedAccessBundle): Promise<{ transferId: string; stored: true; expiresIn: number }>;
  getBundle(transferId: string): Promise<WrappedAccessBundle | null>;
}

export interface DocumentStoreSnapshot {
  envelopes: EncryptedDocumentEvent[];
  snapshots: EncryptedDocumentSnapshot[];
  outboxEventIds: string[];
  outboxSnapshotIds: string[];
  cursor: string | null;
  snapshotCursor: string | null;
}

export interface DocumentStore {
  load(documentId: string): Promise<DocumentStoreSnapshot>;
  saveEnvelope(documentId: string, envelope: EncryptedDocumentEvent): Promise<void>;
  saveSnapshot(documentId: string, snapshot: EncryptedDocumentSnapshot): Promise<void>;
  markPending(documentId: string, eventId: string): Promise<void>;
  markSnapshotPending(documentId: string, snapshotId: string): Promise<void>;
  clearPending(documentId: string, eventId: string): Promise<void>;
  clearSnapshotPending(documentId: string, snapshotId: string): Promise<void>;
  setCursor(documentId: string, cursor: string | null): Promise<void>;
  setSnapshotCursor(documentId: string, cursor: string | null): Promise<void>;
}

export type RealtimeSyncReason = 'open' | 'append' | 'snapshot' | 'timer' | 'manual' | 'online' | 'visible';

export type DocumentSyncState = 'idle' | 'scheduled' | 'syncing' | 'offline' | 'error';

export interface DocumentSyncStatus {
  state: DocumentSyncState;
  pendingEvents: number;
  pendingSnapshots: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  nextSyncAt: string | null;
  attempt: number;
  reason: RealtimeSyncReason | null;
}

export interface RealtimeSyncClock {
  now(): number;
  setTimeout(callback: () => void | Promise<void>, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface RealtimeSyncCoordinator {
  isLeader(): boolean;
  requestSync(reason: RealtimeSyncReason): void;
  announceSynced(status: DocumentSyncStatus): void;
  onSyncRequest(listener: (reason: RealtimeSyncReason) => void): () => void;
  onSynced(listener: (status: DocumentSyncStatus) => void): () => void;
  close(): void;
}

export interface RealtimeSyncOptions {
  enabled?: boolean;
  /**
   * Coalescing window after local writes. Keep this low enough to feel live,
   * but high enough to batch bursts such as typing or draft pick updates.
   */
  pushDebounceMs?: number;
  /** Pull cadence while the document is visible and active. */
  pullIntervalMs?: number;
  /** Pull cadence while hidden/idle or after there is no recent activity. */
  idlePullIntervalMs?: number;
  /** Maximum retry delay after network, quota, or server errors. */
  maxBackoffMs?: number;
  /** Add a little jitter so many devices do not sync on the same millisecond. */
  maxJitterMs?: number;
  /** Pull once as soon as the document opens. */
  startOnOpen?: boolean;
  /** Keep the fast pull loop running when the document is hidden. */
  pullWhenHidden?: boolean;
  /**
   * Avoid duplicate network sync when the same app/document is open in
   * multiple tabs. Defaults to automatic localStorage/BroadcastChannel
   * leadership when the browser supports it.
   */
  tabCoordination?: boolean | RealtimeSyncCoordinator;
  /**
   * When supported by the hub, one leader tab holds a metadata-only stream
   * so remote writes wake the document without waiting for the next poll.
   */
  changeStream?: boolean;
  clock?: RealtimeSyncClock;
  onStatus?: (status: DocumentSyncStatus) => void;
}

export interface OpenDocumentOptions<TState, TPayload = unknown> {
  documentId: string;
  documentKey: string | CryptoKey;
  signing: DeviceSigningKeyPair;
  initialState: TState;
  reducer: (state: TState, event: DocumentEvent<TPayload>) => TState;
  reducerVersion?: string | undefined;
  store?: DocumentStore;
  sync?: SealedSyncClient;
  realtime?: boolean | RealtimeSyncOptions;
}

export interface AppendDocumentEventInput<TPayload = unknown> {
  kind: string;
  payload: TPayload;
  parentIds?: readonly string[] | undefined;
  createdAt?: string | undefined;
  eventId?: string | undefined;
}

export interface DocumentHandle<TState, TPayload = unknown> {
  readonly documentId: string;
  state(): TState;
  events(): readonly DocumentEvent<TPayload>[];
  envelopes(): readonly EncryptedDocumentEvent[];
  snapshots(): readonly EncryptedDocumentSnapshot[];
  pendingEventIds(): readonly string[];
  pendingSnapshotIds(): readonly string[];
  cursor(): string | null;
  snapshotCursor(): string | null;
  latestSnapshot(): DocumentSnapshot<TState> | null;
  append(input: AppendDocumentEventInput<TPayload>): Promise<DocumentEvent<TPayload>>;
  createSnapshot(input?: { snapshotId?: string | undefined; createdAt?: string | undefined }): Promise<EncryptedDocumentSnapshot>;
  sync(): Promise<{ pushed: number; pulled: number; cursor: string | null }>;
  syncStatus(): DocumentSyncStatus;
  requestSync(reason?: RealtimeSyncReason): void;
  stopRealtimeSync(): void;
  refresh(): Promise<void>;
}

export class SealedSyncError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`sealed sync failed (${status})${body ? `: ${body}` : ''}`);
    this.name = 'SealedSyncError';
    this.status = status;
    this.body = body;
  }
}

export function createMemoryDocumentStore(seed?: Record<string, Partial<DocumentStoreSnapshot>>): DocumentStore {
  const docs = new Map<string, DocumentStoreSnapshot>();
  for (const [documentId, snapshot] of Object.entries(seed ?? {})) {
    docs.set(documentId, {
      envelopes: [...(snapshot.envelopes ?? [])],
      snapshots: [...(snapshot.snapshots ?? [])],
      outboxEventIds: [...(snapshot.outboxEventIds ?? [])],
      outboxSnapshotIds: [...(snapshot.outboxSnapshotIds ?? [])],
      cursor: snapshot.cursor ?? null,
      snapshotCursor: snapshot.snapshotCursor ?? null,
    });
  }

  const ensure = (documentId: string): DocumentStoreSnapshot => {
    const existing = docs.get(documentId);
    if (existing) return existing;
    const next: DocumentStoreSnapshot = {
      envelopes: [],
      snapshots: [],
      outboxEventIds: [],
      outboxSnapshotIds: [],
      cursor: null,
      snapshotCursor: null,
    };
    docs.set(documentId, next);
    return next;
  };

  return {
    async load(documentId) {
      const snapshot = ensure(documentId);
      return {
        envelopes: [...snapshot.envelopes],
        snapshots: [...snapshot.snapshots],
        outboxEventIds: [...snapshot.outboxEventIds],
        outboxSnapshotIds: [...snapshot.outboxSnapshotIds],
        cursor: snapshot.cursor,
        snapshotCursor: snapshot.snapshotCursor,
      };
    },
    async saveEnvelope(documentId, envelope) {
      const snapshot = ensure(documentId);
      const index = snapshot.envelopes.findIndex((item) => item.eventId === envelope.eventId);
      if (index >= 0) snapshot.envelopes[index] = envelope;
      else snapshot.envelopes.push(envelope);
    },
    async saveSnapshot(documentId, sealedSnapshot) {
      const snapshot = ensure(documentId);
      const index = snapshot.snapshots.findIndex((item) => item.snapshotId === sealedSnapshot.snapshotId);
      if (index >= 0) snapshot.snapshots[index] = sealedSnapshot;
      else snapshot.snapshots.push(sealedSnapshot);
    },
    async markPending(documentId, eventId) {
      const snapshot = ensure(documentId);
      if (!snapshot.outboxEventIds.includes(eventId)) snapshot.outboxEventIds.push(eventId);
    },
    async markSnapshotPending(documentId, snapshotId) {
      const snapshot = ensure(documentId);
      if (!snapshot.outboxSnapshotIds.includes(snapshotId)) snapshot.outboxSnapshotIds.push(snapshotId);
    },
    async clearPending(documentId, eventId) {
      const snapshot = ensure(documentId);
      snapshot.outboxEventIds = snapshot.outboxEventIds.filter((item) => item !== eventId);
    },
    async clearSnapshotPending(documentId, snapshotId) {
      const snapshot = ensure(documentId);
      snapshot.outboxSnapshotIds = snapshot.outboxSnapshotIds.filter((item) => item !== snapshotId);
    },
    async setCursor(documentId, cursor) {
      ensure(documentId).cursor = cursor;
    },
    async setSnapshotCursor(documentId, cursor) {
      ensure(documentId).snapshotCursor = cursor;
    },
  };
}

export function createLocalStorageDocumentStore(opts: {
  storage?: Storage;
  namespace?: string;
} = {}): DocumentStore {
  const storage = opts.storage ?? globalThis.localStorage;
  if (!storage) throw new Error('@shippie/doc localStorage store requires Storage');
  const namespace = opts.namespace ?? 'shippie.doc.v0';

  const keyFor = (documentId: string) => `${namespace}:${documentId}`;
  const read = (documentId: string): DocumentStoreSnapshot => {
    const raw = storage.getItem(keyFor(documentId));
    if (!raw) {
      return {
        envelopes: [],
        snapshots: [],
        outboxEventIds: [],
        outboxSnapshotIds: [],
        cursor: null,
        snapshotCursor: null,
      };
    }
    try {
      return normaliseSnapshot(JSON.parse(raw));
    } catch {
      return {
        envelopes: [],
        snapshots: [],
        outboxEventIds: [],
        outboxSnapshotIds: [],
        cursor: null,
        snapshotCursor: null,
      };
    }
  };
  const write = (documentId: string, snapshot: DocumentStoreSnapshot) => {
    storage.setItem(keyFor(documentId), JSON.stringify(normaliseSnapshot(snapshot)));
  };

  return {
    async load(documentId) {
      return read(documentId);
    },
    async saveEnvelope(documentId, envelope) {
      const snapshot = read(documentId);
      const index = snapshot.envelopes.findIndex((item) => item.eventId === envelope.eventId);
      if (index >= 0) snapshot.envelopes[index] = envelope;
      else snapshot.envelopes.push(envelope);
      write(documentId, snapshot);
    },
    async saveSnapshot(documentId, sealedSnapshot) {
      const snapshot = read(documentId);
      const index = snapshot.snapshots.findIndex((item) => item.snapshotId === sealedSnapshot.snapshotId);
      if (index >= 0) snapshot.snapshots[index] = sealedSnapshot;
      else snapshot.snapshots.push(sealedSnapshot);
      write(documentId, snapshot);
    },
    async markPending(documentId, eventId) {
      const snapshot = read(documentId);
      if (!snapshot.outboxEventIds.includes(eventId)) snapshot.outboxEventIds.push(eventId);
      write(documentId, snapshot);
    },
    async markSnapshotPending(documentId, snapshotId) {
      const snapshot = read(documentId);
      if (!snapshot.outboxSnapshotIds.includes(snapshotId)) snapshot.outboxSnapshotIds.push(snapshotId);
      write(documentId, snapshot);
    },
    async clearPending(documentId, eventId) {
      const snapshot = read(documentId);
      snapshot.outboxEventIds = snapshot.outboxEventIds.filter((item) => item !== eventId);
      write(documentId, snapshot);
    },
    async clearSnapshotPending(documentId, snapshotId) {
      const snapshot = read(documentId);
      snapshot.outboxSnapshotIds = snapshot.outboxSnapshotIds.filter((item) => item !== snapshotId);
      write(documentId, snapshot);
    },
    async setCursor(documentId, cursor) {
      const snapshot = read(documentId);
      snapshot.cursor = cursor;
      write(documentId, snapshot);
    },
    async setSnapshotCursor(documentId, cursor) {
      const snapshot = read(documentId);
      snapshot.snapshotCursor = cursor;
      write(documentId, snapshot);
    },
  };
}

export function createIndexedDbDocumentStore(opts: {
  indexedDB?: IDBFactory;
  dbName?: string;
  storeName?: string;
  namespace?: string;
} = {}): DocumentStore {
  const factory = opts.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error('@shippie/doc IndexedDB store requires indexedDB');
  const dbName = opts.dbName ?? 'shippie.doc.v0';
  const storeName = opts.storeName ?? 'documents';
  const namespace = opts.namespace ?? 'default';
  const db = openDocumentIndexedDb(factory, dbName, storeName);
  const keyFor = (documentId: string) => `${namespace}:${documentId}`;

  const read = async (documentId: string): Promise<DocumentStoreSnapshot> => {
    const value = await idbGet(await db, storeName, keyFor(documentId));
    return normaliseSnapshot(value ?? {
      envelopes: [],
      snapshots: [],
      outboxEventIds: [],
      outboxSnapshotIds: [],
      cursor: null,
      snapshotCursor: null,
    });
  };
  const write = async (documentId: string, snapshot: DocumentStoreSnapshot): Promise<void> => {
    await idbPut(await db, storeName, keyFor(documentId), normaliseSnapshot(snapshot));
  };

  return {
    async load(documentId) {
      return read(documentId);
    },
    async saveEnvelope(documentId, envelope) {
      const snapshot = await read(documentId);
      const index = snapshot.envelopes.findIndex((item) => item.eventId === envelope.eventId);
      if (index >= 0) snapshot.envelopes[index] = envelope;
      else snapshot.envelopes.push(envelope);
      await write(documentId, snapshot);
    },
    async saveSnapshot(documentId, sealedSnapshot) {
      const snapshot = await read(documentId);
      const index = snapshot.snapshots.findIndex((item) => item.snapshotId === sealedSnapshot.snapshotId);
      if (index >= 0) snapshot.snapshots[index] = sealedSnapshot;
      else snapshot.snapshots.push(sealedSnapshot);
      await write(documentId, snapshot);
    },
    async markPending(documentId, eventId) {
      const snapshot = await read(documentId);
      if (!snapshot.outboxEventIds.includes(eventId)) snapshot.outboxEventIds.push(eventId);
      await write(documentId, snapshot);
    },
    async markSnapshotPending(documentId, snapshotId) {
      const snapshot = await read(documentId);
      if (!snapshot.outboxSnapshotIds.includes(snapshotId)) snapshot.outboxSnapshotIds.push(snapshotId);
      await write(documentId, snapshot);
    },
    async clearPending(documentId, eventId) {
      const snapshot = await read(documentId);
      snapshot.outboxEventIds = snapshot.outboxEventIds.filter((item) => item !== eventId);
      await write(documentId, snapshot);
    },
    async clearSnapshotPending(documentId, snapshotId) {
      const snapshot = await read(documentId);
      snapshot.outboxSnapshotIds = snapshot.outboxSnapshotIds.filter((item) => item !== snapshotId);
      await write(documentId, snapshot);
    },
    async setCursor(documentId, cursor) {
      const snapshot = await read(documentId);
      snapshot.cursor = cursor;
      await write(documentId, snapshot);
    },
    async setSnapshotCursor(documentId, cursor) {
      const snapshot = await read(documentId);
      snapshot.snapshotCursor = cursor;
      await write(documentId, snapshot);
    },
  };
}

const DOCUMENT_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('@shippie/doc requires Web Crypto SubtleCrypto');
  }
  return globalThis.crypto.subtle;
}

function freshBytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  const bytes = textEncoder.encode(value);
  const out = freshBytes(bytes.byteLength);
  out.set(bytes);
  return out;
}

function toArrayBufferBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  if (input.buffer instanceof ArrayBuffer && input.byteOffset === 0 && input.byteLength === input.buffer.byteLength) {
    return input as Uint8Array<ArrayBuffer>;
  }
  const out = freshBytes(input.byteLength);
  out.set(input);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + padding);
  const bytes = freshBytes(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function generateDocumentKey(): string {
  const bytes = freshBytes(DOCUMENT_KEY_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function generateAccessTransferId(): string {
  const bytes = freshBytes(18);
  globalThis.crypto.getRandomValues(bytes);
  return `transfer_${base64UrlEncode(bytes)}`;
}

export async function importDocumentKey(raw: string): Promise<CryptoKey> {
  const bytes = base64UrlDecode(raw);
  if (bytes.byteLength !== DOCUMENT_KEY_BYTES) {
    throw new Error(`document key must be ${DOCUMENT_KEY_BYTES} bytes`);
  }
  return subtle().importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function generateDeviceSigningKeyPair(): Promise<DeviceSigningKeyPair> {
  const pair = (await subtle().generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey));
  const publicKeySpki = base64UrlEncode(spki);
  const deviceId = `dev_${(await sha256Base64Url(spki)).slice(0, 32)}`;
  return {
    deviceId,
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicKeySpki,
  };
}

export async function generateAccessTransferKeyPair(): Promise<AccessTransferKeyPair> {
  const pair = (await subtle().generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey));
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicKeySpki: base64UrlEncode(spki),
  };
}

export async function importDevicePublicKey(publicKeySpki: string): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    base64UrlDecode(publicKeySpki),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
}

export async function importAccessTransferPublicKey(publicKeySpki: string): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    base64UrlDecode(publicKeySpki),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

export async function wrapAccessBundle(input: WrapAccessBundleInput): Promise<WrappedAccessBundle> {
  const recipientPublicKey = await importAccessTransferPublicKey(input.recipientPublicKeySpki);
  const ephemeral = await generateAccessTransferKeyPair();
  const key = await deriveAccessBundleKey(ephemeral.privateKey, recipientPublicKey);
  const nonce = freshBytes(NONCE_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      encodeUtf8(canonicalize(normaliseAccessBundle(input.bundle))),
    ),
  );
  return {
    schema: 'shippie.document.wrapped-access-bundle.v1',
    alg: 'ECDH-P256-AES-256-GCM',
    senderPublicKey: ephemeral.publicKeySpki,
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
  };
}

export async function unwrapAccessBundle(input: UnwrapAccessBundleInput): Promise<DocumentAccessBundle> {
  if (input.wrapped.schema !== 'shippie.document.wrapped-access-bundle.v1') {
    throw new Error('unsupported wrapped access bundle schema');
  }
  if (input.wrapped.alg !== 'ECDH-P256-AES-256-GCM') {
    throw new Error('unsupported wrapped access bundle algorithm');
  }
  const senderPublicKey = await importAccessTransferPublicKey(input.wrapped.senderPublicKey);
  const key = await deriveAccessBundleKey(input.recipientPrivateKey, senderPublicKey);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(input.wrapped.nonce) },
    key,
    base64UrlDecode(input.wrapped.ciphertext),
  );
  return normaliseAccessBundle(JSON.parse(textDecoder.decode(plaintext)));
}

async function deriveAccessBundleKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return subtle().deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptDocumentEvent<TPayload = unknown>(
  input: EncryptDocumentEventInput<TPayload>,
): Promise<EncryptedDocumentEvent> {
  const documentKey = typeof input.documentKey === 'string' ? await importDocumentKey(input.documentKey) : input.documentKey;
  const event: DocumentEvent<TPayload> = {
    schema: SHIPPIE_DOCUMENT_EVENT_SCHEMA,
    documentId: input.documentId,
    eventId: input.eventId ?? randomId('evt'),
    parentIds: [...(input.parentIds ?? [])].sort(),
    authorDeviceId: input.signing.deviceId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    kind: input.kind,
    payload: input.payload,
  };
  const signature = await signCanonical(input.signing.privateKey, event);
  const signed: SignedDocumentEvent<TPayload> = {
    event,
    authorPublicKey: input.signing.publicKeySpki,
    signatureAlg: 'ECDSA-P256-SHA256',
    signature,
  };

  const nonce = freshBytes(NONCE_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const plaintext = encodeUtf8(canonicalize(signed));
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, documentKey, plaintext),
  );

  return {
    schema: SHIPPIE_ENCRYPTED_EVENT_SCHEMA,
    documentId: event.documentId,
    eventId: event.eventId,
    parentIds: event.parentIds,
    authorDeviceId: event.authorDeviceId,
    authorPublicKey: signed.authorPublicKey,
    createdAt: event.createdAt,
    cipher: 'AES-256-GCM',
    signatureAlg: 'ECDSA-P256-SHA256',
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
  };
}

export async function decryptDocumentEvent<TPayload = unknown>(
  input: DecryptDocumentEventInput,
): Promise<SignedDocumentEvent<TPayload>> {
  const documentKey = typeof input.documentKey === 'string' ? await importDocumentKey(input.documentKey) : input.documentKey;
  const envelope = input.envelope;
  if (envelope.schema !== SHIPPIE_ENCRYPTED_EVENT_SCHEMA) throw new Error('unsupported encrypted event schema');
  if (envelope.cipher !== 'AES-256-GCM') throw new Error('unsupported document cipher');
  if (envelope.signatureAlg !== 'ECDSA-P256-SHA256') throw new Error('unsupported signature algorithm');

  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(envelope.nonce) },
    documentKey,
    base64UrlDecode(envelope.ciphertext),
  );
  const parsed = JSON.parse(textDecoder.decode(plaintext)) as SignedDocumentEvent<TPayload>;
  assertEnvelopeMatchesSignedEvent(envelope, parsed);
  const ok = await verifySignedDocumentEvent(parsed);
  if (!ok) throw new Error('document event signature verification failed');
  return parsed;
}

export async function encryptDocumentSnapshot<TState = unknown>(
  input: EncryptDocumentSnapshotInput<TState>,
): Promise<EncryptedDocumentSnapshot> {
  const documentKey = typeof input.documentKey === 'string' ? await importDocumentKey(input.documentKey) : input.documentKey;
  const snapshot: DocumentSnapshot<TState> = {
    schema: SHIPPIE_DOCUMENT_SNAPSHOT_SCHEMA,
    documentId: input.documentId,
    snapshotId: input.snapshotId ?? randomId('snap'),
    authorDeviceId: input.signing.deviceId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    reducerVersion: input.reducerVersion,
    lastEventId: input.lastEventId ?? null,
    lastEventCreatedAt: input.lastEventCreatedAt ?? null,
    eventCount: Math.max(0, Math.floor(input.eventCount)),
    state: input.state,
  };
  const signature = await signCanonical(input.signing.privateKey, snapshot);
  const signed: SignedDocumentSnapshot<TState> = {
    snapshot,
    authorPublicKey: input.signing.publicKeySpki,
    signatureAlg: 'ECDSA-P256-SHA256',
    signature,
  };

  const nonce = freshBytes(NONCE_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, documentKey, encodeUtf8(canonicalize(signed))),
  );

  return {
    schema: SHIPPIE_ENCRYPTED_SNAPSHOT_SCHEMA,
    documentId: snapshot.documentId,
    snapshotId: snapshot.snapshotId,
    authorDeviceId: snapshot.authorDeviceId,
    authorPublicKey: signed.authorPublicKey,
    createdAt: snapshot.createdAt,
    reducerVersion: snapshot.reducerVersion,
    lastEventId: snapshot.lastEventId,
    lastEventCreatedAt: snapshot.lastEventCreatedAt,
    eventCount: snapshot.eventCount,
    cipher: 'AES-256-GCM',
    signatureAlg: 'ECDSA-P256-SHA256',
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
  };
}

export async function decryptDocumentSnapshot<TState = unknown>(
  input: DecryptDocumentSnapshotInput,
): Promise<SignedDocumentSnapshot<TState>> {
  const documentKey = typeof input.documentKey === 'string' ? await importDocumentKey(input.documentKey) : input.documentKey;
  const envelope = input.envelope;
  if (envelope.schema !== SHIPPIE_ENCRYPTED_SNAPSHOT_SCHEMA) throw new Error('unsupported encrypted snapshot schema');
  if (envelope.cipher !== 'AES-256-GCM') throw new Error('unsupported document cipher');
  if (envelope.signatureAlg !== 'ECDSA-P256-SHA256') throw new Error('unsupported signature algorithm');

  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(envelope.nonce) },
    documentKey,
    base64UrlDecode(envelope.ciphertext),
  );
  const parsed = JSON.parse(textDecoder.decode(plaintext)) as SignedDocumentSnapshot<TState>;
  assertEnvelopeMatchesSignedSnapshot(envelope, parsed);
  const ok = await verifySignedDocumentSnapshot(parsed);
  if (!ok) throw new Error('document snapshot signature verification failed');
  return parsed;
}

export async function verifySignedDocumentSnapshot(snapshot: SignedDocumentSnapshot): Promise<boolean> {
  if (snapshot.snapshot.schema !== SHIPPIE_DOCUMENT_SNAPSHOT_SCHEMA) return false;
  if (snapshot.signatureAlg !== 'ECDSA-P256-SHA256') return false;
  const publicKey = await importDevicePublicKey(snapshot.authorPublicKey);
  return subtle().verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    base64UrlDecode(snapshot.signature),
    encodeUtf8(canonicalize(snapshot.snapshot)),
  );
}

export async function encryptAttachment(input: EncryptAttachmentInput): Promise<EncryptedAttachmentPayload> {
  const documentKey = typeof input.documentKey === 'string' ? await importDocumentKey(input.documentKey) : input.documentKey;
  const bytes = await bytesFromBody(input.bytes);
  const nonce = freshBytes(NONCE_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const ciphertext = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, documentKey, bytes));
  return {
    schema: SHIPPIE_ENCRYPTED_ATTACHMENT_SCHEMA,
    cipher: 'AES-256-GCM',
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
    byteLength: bytes.byteLength,
    contentType: normaliseContentType(input.contentType) ?? undefined,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export async function decryptAttachment(input: DecryptAttachmentInput): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | null }> {
  const documentKey = typeof input.documentKey === 'string' ? await importDocumentKey(input.documentKey) : input.documentKey;
  const payload = normaliseEncryptedAttachment(input.payload);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(payload.nonce) },
    documentKey,
    base64UrlDecode(payload.ciphertext),
  );
  const bytes = toArrayBufferBytes(new Uint8Array(plaintext));
  if (bytes.byteLength !== payload.byteLength) throw new Error('encrypted attachment byte length mismatch');
  return { bytes, contentType: payload.contentType ?? null };
}

export function encryptedAttachmentToBytes(payload: EncryptedAttachmentPayload): Uint8Array<ArrayBuffer> {
  return encodeUtf8(canonicalize(normaliseEncryptedAttachment(payload)));
}

export function encryptedAttachmentFromBytes(bytes: Uint8Array | ArrayBuffer): EncryptedAttachmentPayload {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return normaliseEncryptedAttachment(JSON.parse(textDecoder.decode(view)));
}

export async function pushEncryptedAttachment(
  sync: SealedSyncClient,
  input: EncryptAttachmentInput & { documentId: string; attachmentId: string },
): Promise<SealedAttachmentPushResult> {
  const payload = await encryptAttachment(input);
  return sync.pushAttachment(input.documentId, input.attachmentId, encryptedAttachmentToBytes(payload), {
    contentType: 'application/json',
  });
}

export async function pullEncryptedAttachment(
  sync: SealedSyncClient,
  input: { documentId: string; documentKey: string | CryptoKey; attachmentId: string },
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | null }> {
  const blob = await sync.pullAttachment(input.documentId, input.attachmentId);
  const payload = encryptedAttachmentFromBytes(new Uint8Array(await blob.arrayBuffer()));
  return decryptAttachment({ documentKey: input.documentKey, payload });
}

export async function pushEncryptedAttachmentChunked(
  sync: SealedSyncClient,
  input: EncryptAttachmentInput & { documentId: string; attachmentId: string; chunkSize?: number },
): Promise<{ manifestAttachmentId: string; chunks: number; byteLength: number }> {
  const bytes = await bytesFromBody(input.bytes);
  const chunkSize = Math.max(64 * 1024, Math.min(input.chunkSize ?? 1024 * 1024, 8 * 1024 * 1024));
  const chunks: EncryptedAttachmentManifest['chunks'] = [];
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += chunkSize, index += 1) {
    const chunk = bytes.slice(offset, Math.min(bytes.byteLength, offset + chunkSize));
    const chunkAttachmentId = `${input.attachmentId}.chunk-${String(index).padStart(5, '0')}`;
    await pushEncryptedAttachment(sync, {
      documentId: input.documentId,
      documentKey: input.documentKey,
      attachmentId: chunkAttachmentId,
      bytes: chunk,
      contentType: 'application/octet-stream',
      createdAt: input.createdAt,
    });
    chunks.push({ attachmentId: chunkAttachmentId, byteLength: chunk.byteLength, sha256: await sha256Base64Url(chunk) });
  }

  const manifest: EncryptedAttachmentManifest = {
    schema: SHIPPIE_ENCRYPTED_ATTACHMENT_MANIFEST_SCHEMA,
    attachmentId: input.attachmentId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    totalByteLength: bytes.byteLength,
    contentType: normaliseContentType(input.contentType) ?? undefined,
    sha256: await sha256Base64Url(bytes),
    chunks,
  };
  const manifestAttachmentId = `${input.attachmentId}.manifest`;
  await pushEncryptedAttachment(sync, {
    documentId: input.documentId,
    documentKey: input.documentKey,
    attachmentId: manifestAttachmentId,
    bytes: encodeUtf8(canonicalize(manifest)),
    contentType: 'application/json',
    createdAt: manifest.createdAt,
  });
  return { manifestAttachmentId, chunks: chunks.length, byteLength: bytes.byteLength };
}

export async function pullEncryptedAttachmentChunked(
  sync: SealedSyncClient,
  input: { documentId: string; documentKey: string | CryptoKey; attachmentId: string },
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | null }> {
  const manifestAttachment = await pullEncryptedAttachment(sync, {
    documentId: input.documentId,
    documentKey: input.documentKey,
    attachmentId: `${input.attachmentId}.manifest`,
  });
  const manifest = normaliseEncryptedAttachmentManifest(JSON.parse(textDecoder.decode(manifestAttachment.bytes)));
  const parts = await Promise.all(
    manifest.chunks.map(async (chunk) => {
      const part = await pullEncryptedAttachment(sync, {
        documentId: input.documentId,
        documentKey: input.documentKey,
        attachmentId: chunk.attachmentId,
      });
      if (chunk.sha256 && (await sha256Base64Url(part.bytes)) !== chunk.sha256) {
        throw new Error('encrypted attachment chunk hash mismatch');
      }
      return part;
    }),
  );
  const total = parts.reduce((sum, part) => sum + part.bytes.byteLength, 0);
  if (total !== manifest.totalByteLength) throw new Error('encrypted attachment chunk total mismatch');
  const joined = freshBytes(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part.bytes, offset);
    offset += part.bytes.byteLength;
  }
  if (manifest.sha256 && (await sha256Base64Url(joined)) !== manifest.sha256) {
    throw new Error('encrypted attachment hash mismatch');
  }
  return { bytes: joined, contentType: manifest.contentType ?? null };
}

export async function verifySignedDocumentEvent(event: SignedDocumentEvent): Promise<boolean> {
  if (event.event.schema !== SHIPPIE_DOCUMENT_EVENT_SCHEMA) return false;
  if (event.signatureAlg !== 'ECDSA-P256-SHA256') return false;
  const publicKey = await importDevicePublicKey(event.authorPublicKey);
  return subtle().verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    base64UrlDecode(event.signature),
    encodeUtf8(canonicalize(event.event)),
  );
}

export function compareDocumentEvents(a: DocumentEvent, b: DocumentEvent): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.eventId.localeCompare(b.eventId);
}

export function reduceDocumentEvents<TState, TPayload>(
  initialState: TState,
  events: readonly DocumentEvent<TPayload>[],
  reducer: (state: TState, event: DocumentEvent<TPayload>) => TState,
): TState {
  return [...events].sort(compareDocumentEvents).reduce(reducer, initialState);
}

export async function openDocument<TState, TPayload = unknown>(
  opts: OpenDocumentOptions<TState, TPayload>,
): Promise<DocumentHandle<TState, TPayload>> {
  const store = opts.store ?? createMemoryDocumentStore();
  const runtime = new RuntimeDocument<TState, TPayload>(opts, store);
  await runtime.refresh();
  runtime.startRealtimeSync();
  return runtime;
}

export function createSealedSyncClient(opts: SealedSyncClientOptions = {}): SealedSyncClient {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error('@shippie/doc sealed sync requires fetch');

  return {
    async pushEvent(event) {
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/${encodeURIComponent(event.documentId)}/events`), {
        method: 'POST',
        headers: mergeHeaders(opts.headers, { 'content-type': 'application/json' }),
        body: JSON.stringify(event),
      });
      await assertOk(response);
      return response.json() as Promise<SealedEventPushResult>;
    },

    async pushEvents(documentId, events) {
      if (events.length === 0) return { events: [], stored: 0, cursor: null };
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/events`), {
        method: 'POST',
        headers: mergeHeaders(opts.headers, { 'content-type': 'application/json' }),
        body: JSON.stringify(events),
      });
      await assertOk(response);
      return response.json() as Promise<SealedEventBatchPushResult>;
    },

    async pullEvents(documentId, pullOpts = {}) {
      const params = new URLSearchParams();
      if (pullOpts.cursor) params.set('cursor', pullOpts.cursor);
      if (typeof pullOpts.limit === 'number') params.set('limit', String(pullOpts.limit));
      const query = params.toString();
      const response = await fetchImpl(
        urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/events${query ? `?${query}` : ''}`),
        requestInit('GET', opts.headers),
      );
      await assertOk(response);
      return validateSealedEventPage(await response.json());
    },

    async pushSnapshot(snapshot) {
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/${encodeURIComponent(snapshot.documentId)}/snapshots`), {
        method: 'POST',
        headers: mergeHeaders(opts.headers, { 'content-type': 'application/json' }),
        body: JSON.stringify(snapshot),
      });
      await assertOk(response);
      return response.json() as Promise<SealedSnapshotPushResult>;
    },

    async pullSnapshots(documentId, pullOpts = {}) {
      const params = new URLSearchParams();
      if (pullOpts.cursor) params.set('cursor', pullOpts.cursor);
      if (typeof pullOpts.limit === 'number') params.set('limit', String(pullOpts.limit));
      const query = params.toString();
      const response = await fetchImpl(
        urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/snapshots${query ? `?${query}` : ''}`),
        requestInit('GET', opts.headers),
      );
      await assertOk(response);
      return validateSealedSnapshotPage(await response.json());
    },

    async pullLatestSnapshot(documentId) {
      const response = await fetchImpl(
        urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/snapshots?latest=1&limit=1`),
        requestInit('GET', opts.headers),
      );
      await assertOk(response);
      const page = validateSealedSnapshotPage(await response.json());
      return page.snapshots[0] ?? null;
    },

    async getManifest(documentId) {
      const response = await fetchImpl(
        urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/manifest`),
        requestInit('GET', opts.headers),
      );
      await assertOk(response);
      return normaliseSealedDocumentManifest(await response.json());
    },

    async getChangeHint(documentId, hintOpts = {}) {
      const params = new URLSearchParams();
      if (hintOpts.eventCursor) params.set('eventCursor', hintOpts.eventCursor);
      if (hintOpts.snapshotCursor) params.set('snapshotCursor', hintOpts.snapshotCursor);
      if (typeof hintOpts.eventCount === 'number') params.set('eventCount', String(Math.max(0, Math.floor(hintOpts.eventCount))));
      if (typeof hintOpts.snapshotCount === 'number') params.set('snapshotCount', String(Math.max(0, Math.floor(hintOpts.snapshotCount))));
      const query = params.toString();
      const response = await fetchImpl(
        urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/hint${query ? `?${query}` : ''}`),
        requestInit('GET', opts.headers),
      );
      await assertOk(response);
      return normaliseSealedDocumentChangeHint(documentId, await response.json());
    },

    watchChangeHint(documentId, hintOpts) {
      const EventSourceCtor = (globalThis as typeof globalThis & {
        EventSource?: new (url: string) => {
          addEventListener(type: string, listener: (event: { data?: string }) => void): void;
          close(): void;
        };
      }).EventSource;
      if (typeof EventSourceCtor !== 'function') return null;
      const params = new URLSearchParams();
      if (hintOpts.eventCursor) params.set('eventCursor', hintOpts.eventCursor);
      if (hintOpts.snapshotCursor) params.set('snapshotCursor', hintOpts.snapshotCursor);
      if (typeof hintOpts.eventCount === 'number') params.set('eventCount', String(Math.max(0, Math.floor(hintOpts.eventCount))));
      if (typeof hintOpts.snapshotCount === 'number') params.set('snapshotCount', String(Math.max(0, Math.floor(hintOpts.snapshotCount))));
      if (typeof hintOpts.timeoutMs === 'number') params.set('timeoutMs', String(Math.max(1000, Math.floor(hintOpts.timeoutMs))));
      if (typeof hintOpts.intervalMs === 'number') params.set('intervalMs', String(Math.max(250, Math.floor(hintOpts.intervalMs))));
      const query = params.toString();
      const source = new EventSourceCtor(
        urlFor(opts.origin, `/api/documents/${encodeURIComponent(documentId)}/changes${query ? `?${query}` : ''}`),
      );
      source.addEventListener('change', (event) => {
        try {
          source.close();
          hintOpts.onChange(normaliseSealedDocumentChangeHint(documentId, JSON.parse(event.data ?? '{}')));
        } catch (err) {
          hintOpts.onError?.(err);
        }
      });
      source.addEventListener('error', (event) => {
        source.close();
        hintOpts.onError?.(event);
      });
      return { close: () => source.close() };
    },

    async pushAttachment(documentId, attachmentId, bytes, attachmentOpts = {}) {
      const { wireContentType, originalContentType } = attachmentContentTypes(attachmentOpts.contentType);
      const extraHeaders: Record<string, string> = { 'content-type': wireContentType };
      if (originalContentType) extraHeaders['x-shippie-attachment-content-type'] = originalContentType;
      const headers = mergeHeaders(opts.headers, extraHeaders);
      const response = await fetchImpl(
        urlFor(
          opts.origin,
          `/api/documents/${encodeURIComponent(documentId)}/attachments/${encodeURIComponent(attachmentId)}`,
        ),
        {
          method: 'PUT',
          headers,
          body: bodyForBytes(bytes),
        },
      );
      await assertOk(response);
      return response.json() as Promise<SealedAttachmentPushResult>;
    },

    async pullAttachment(documentId, attachmentId) {
      const response = await fetchImpl(
        urlFor(
          opts.origin,
          `/api/documents/${encodeURIComponent(documentId)}/attachments/${encodeURIComponent(attachmentId)}`,
        ),
        requestInit('GET', opts.headers),
      );
      await assertOk(response);
      return response.blob();
    },
  };
}

export function createAccessTransferRelayClient(opts: SealedSyncClientOptions = {}): AccessTransferRelayClient {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error('@shippie/doc access transfer requires fetch');

  return {
    async putRequest(transferId, request) {
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/transfer/${encodeURIComponent(transferId)}/request`), {
        method: 'PUT',
        headers: mergeHeaders(opts.headers, { 'content-type': 'application/json' }),
        body: JSON.stringify(normaliseAccessTransferRequest(request)),
      });
      await assertOk(response);
      return response.json() as Promise<{ transferId: string; stored: true; expiresIn: number }>;
    },

    async getRequest(transferId) {
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/transfer/${encodeURIComponent(transferId)}/request`), {
        method: 'GET',
        ...(opts.headers ? { headers: opts.headers } : {}),
      });
      if (response.status === 404) return null;
      await assertOk(response);
      return normaliseAccessTransferRequest(await response.json());
    },

    async putBundle(transferId, bundle) {
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/transfer/${encodeURIComponent(transferId)}`), {
        method: 'PUT',
        headers: mergeHeaders(opts.headers, { 'content-type': 'application/json' }),
        body: JSON.stringify(bundle),
      });
      await assertOk(response);
      return response.json() as Promise<{ transferId: string; stored: true; expiresIn: number }>;
    },

    async getBundle(transferId) {
      const response = await fetchImpl(urlFor(opts.origin, `/api/documents/transfer/${encodeURIComponent(transferId)}`), {
        method: 'GET',
        ...(opts.headers ? { headers: opts.headers } : {}),
      });
      if (response.status === 404) return null;
      await assertOk(response);
      return normaliseWrappedAccessBundle(await response.json());
    },
  };
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function validateSealedEventPage(value: unknown): SealedEventPage {
  if (!value || typeof value !== 'object') throw new Error('invalid sealed event page');
  const page = value as Partial<SealedEventPage>;
  if (!Array.isArray(page.events)) throw new Error('sealed event page missing events');
  return {
    events: page.events.map(validateEncryptedDocumentEvent),
    cursor: typeof page.cursor === 'string' ? page.cursor : null,
    truncated: page.truncated === true,
  };
}

function validateSealedSnapshotPage(value: unknown): SealedSnapshotPage {
  if (!value || typeof value !== 'object') throw new Error('invalid sealed snapshot page');
  const page = value as Partial<SealedSnapshotPage>;
  if (!Array.isArray(page.snapshots)) throw new Error('sealed snapshot page missing snapshots');
  return {
    snapshots: page.snapshots.map(validateEncryptedDocumentSnapshot),
    cursor: typeof page.cursor === 'string' ? page.cursor : null,
    truncated: page.truncated === true,
  };
}

function validateEncryptedDocumentEvent(value: unknown): EncryptedDocumentEvent {
  if (!value || typeof value !== 'object') throw new Error('invalid encrypted document event');
  const event = value as Partial<EncryptedDocumentEvent>;
  if (event.schema !== SHIPPIE_ENCRYPTED_EVENT_SCHEMA) throw new Error('unsupported encrypted event schema');
  if (
    typeof event.documentId !== 'string' ||
    typeof event.eventId !== 'string' ||
    !Array.isArray(event.parentIds) ||
    event.parentIds.some((id) => typeof id !== 'string') ||
    typeof event.authorDeviceId !== 'string' ||
    typeof event.authorPublicKey !== 'string' ||
    typeof event.createdAt !== 'string' ||
    event.cipher !== 'AES-256-GCM' ||
    event.signatureAlg !== 'ECDSA-P256-SHA256' ||
    typeof event.nonce !== 'string' ||
    typeof event.ciphertext !== 'string'
  ) {
    throw new Error('invalid encrypted document event');
  }
  return {
    schema: event.schema,
    documentId: event.documentId,
    eventId: event.eventId,
    parentIds: event.parentIds,
    authorDeviceId: event.authorDeviceId,
    authorPublicKey: event.authorPublicKey,
    createdAt: event.createdAt,
    cipher: event.cipher,
    signatureAlg: event.signatureAlg,
    nonce: event.nonce,
    ciphertext: event.ciphertext,
  };
}

function validateEncryptedDocumentSnapshot(value: unknown): EncryptedDocumentSnapshot {
  if (!value || typeof value !== 'object') throw new Error('invalid encrypted document snapshot');
  const snapshot = value as Partial<EncryptedDocumentSnapshot>;
  if (
    snapshot.schema !== SHIPPIE_ENCRYPTED_SNAPSHOT_SCHEMA ||
    typeof snapshot.documentId !== 'string' ||
    typeof snapshot.snapshotId !== 'string' ||
    typeof snapshot.authorDeviceId !== 'string' ||
    typeof snapshot.authorPublicKey !== 'string' ||
    typeof snapshot.createdAt !== 'string' ||
    typeof snapshot.eventCount !== 'number' ||
    snapshot.eventCount < 0 ||
    snapshot.cipher !== 'AES-256-GCM' ||
    snapshot.signatureAlg !== 'ECDSA-P256-SHA256' ||
    typeof snapshot.nonce !== 'string' ||
    typeof snapshot.ciphertext !== 'string'
  ) {
    throw new Error('invalid encrypted document snapshot');
  }
  return {
    schema: snapshot.schema,
    documentId: snapshot.documentId,
    snapshotId: snapshot.snapshotId,
    authorDeviceId: snapshot.authorDeviceId,
    authorPublicKey: snapshot.authorPublicKey,
    createdAt: snapshot.createdAt,
    reducerVersion: typeof snapshot.reducerVersion === 'string' ? snapshot.reducerVersion : undefined,
    lastEventId: typeof snapshot.lastEventId === 'string' ? snapshot.lastEventId : null,
    lastEventCreatedAt: typeof snapshot.lastEventCreatedAt === 'string' ? snapshot.lastEventCreatedAt : null,
    eventCount: Math.floor(snapshot.eventCount),
    cipher: snapshot.cipher,
    signatureAlg: snapshot.signatureAlg,
    nonce: snapshot.nonce,
    ciphertext: snapshot.ciphertext,
  };
}

function normaliseSealedDocumentManifest(value: unknown): SealedDocumentManifest {
  if (!value || typeof value !== 'object') throw new Error('invalid sealed document manifest');
  const manifest = value as Partial<SealedDocumentManifest>;
  if (manifest.schema !== 'shippie.document.manifest.v1' || typeof manifest.documentId !== 'string') {
    throw new Error('invalid sealed document manifest');
  }
  return {
    schema: manifest.schema,
    documentId: manifest.documentId,
    eventCount: safeCount(manifest.eventCount),
    snapshotCount: safeCount(manifest.snapshotCount),
    attachmentCount: safeCount(manifest.attachmentCount),
    latestEventId: typeof manifest.latestEventId === 'string' ? manifest.latestEventId : null,
    latestEventCursor: typeof manifest.latestEventCursor === 'string' ? manifest.latestEventCursor : null,
    latestSnapshotId: typeof manifest.latestSnapshotId === 'string' ? manifest.latestSnapshotId : null,
    latestSnapshotCursor: typeof manifest.latestSnapshotCursor === 'string' ? manifest.latestSnapshotCursor : null,
    lastAttachmentId: typeof manifest.lastAttachmentId === 'string' ? manifest.lastAttachmentId : null,
    updatedAt: typeof manifest.updatedAt === 'string' ? manifest.updatedAt : null,
  };
}

function normaliseSealedDocumentChangeHint(documentId: string, value: unknown): SealedDocumentChangeHint {
  if (!value || typeof value !== 'object') throw new Error('invalid sealed document change hint');
  const hint = value as Partial<SealedDocumentChangeHint>;
  if (hint.schema !== 'shippie.document.change-hint.v1' || hint.documentId !== documentId) {
    throw new Error('invalid sealed document change hint');
  }
  return {
    schema: 'shippie.document.change-hint.v1',
    documentId,
    eventCount: safeCount(hint.eventCount),
    snapshotCount: safeCount(hint.snapshotCount),
    attachmentCount: safeCount(hint.attachmentCount),
    latestEventId: typeof hint.latestEventId === 'string' ? hint.latestEventId : null,
    latestEventCursor: typeof hint.latestEventCursor === 'string' ? hint.latestEventCursor : null,
    latestSnapshotId: typeof hint.latestSnapshotId === 'string' ? hint.latestSnapshotId : null,
    latestSnapshotCursor: typeof hint.latestSnapshotCursor === 'string' ? hint.latestSnapshotCursor : null,
    updatedAt: typeof hint.updatedAt === 'string' ? hint.updatedAt : null,
    changed: hint.changed === true,
  };
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let body = '';
  try {
    body = await response.text();
  } catch {
    body = '';
  }
  throw new SealedSyncError(response.status, body);
}

function urlFor(origin: string | undefined, path: string): string {
  if (!origin) return path;
  return new URL(path, origin.endsWith('/') ? origin : `${origin}/`).toString();
}

function requestInit(method: string, headers: HeadersInit | undefined): RequestInit {
  return headers ? { method, headers } : { method };
}

function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): Headers {
  const headers = new Headers(base);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return headers;
}

function attachmentContentTypes(contentType: string | undefined): {
  wireContentType: string;
  originalContentType: string | null;
} {
  const cleaned = normaliseContentType(contentType);
  if (!cleaned) return { wireContentType: 'application/octet-stream', originalContentType: null };
  if (isFormLikeContentType(cleaned)) {
    return { wireContentType: 'application/octet-stream', originalContentType: cleaned };
  }
  return { wireContentType: cleaned, originalContentType: null };
}

function normaliseContentType(contentType: string | undefined): string | null {
  const trimmed = contentType?.trim().toLowerCase();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  return trimmed.slice(0, 160);
}

function isFormLikeContentType(contentType: string): boolean {
  const type = contentType.split(';', 1)[0]?.trim();
  return type === 'text/plain' || type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data';
}

function bodyForBytes(bytes: Blob | Uint8Array | ArrayBuffer): BodyInit {
  if (bytes instanceof Blob) return bytes;
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : toArrayBufferBytes(bytes).buffer;
}

function normaliseSnapshot(value: unknown): DocumentStoreSnapshot {
  if (!value || typeof value !== 'object') {
    return {
      envelopes: [],
      snapshots: [],
      outboxEventIds: [],
      outboxSnapshotIds: [],
      cursor: null,
      snapshotCursor: null,
    };
  }
  const snapshot = value as Partial<DocumentStoreSnapshot>;
  return {
    envelopes: Array.isArray(snapshot.envelopes)
      ? snapshot.envelopes.map((item) => {
          try {
            return validateEncryptedDocumentEvent(item);
          } catch {
            return null;
          }
        }).filter((item): item is EncryptedDocumentEvent => item !== null)
      : [],
    snapshots: Array.isArray(snapshot.snapshots)
      ? snapshot.snapshots.map((item) => {
          try {
            return validateEncryptedDocumentSnapshot(item);
          } catch {
            return null;
          }
        }).filter((item): item is EncryptedDocumentSnapshot => item !== null)
      : [],
    outboxEventIds: Array.isArray(snapshot.outboxEventIds)
      ? snapshot.outboxEventIds.filter((item): item is string => typeof item === 'string')
      : [],
    outboxSnapshotIds: Array.isArray(snapshot.outboxSnapshotIds)
      ? snapshot.outboxSnapshotIds.filter((item): item is string => typeof item === 'string')
      : [],
    cursor: typeof snapshot.cursor === 'string' ? snapshot.cursor : null,
    snapshotCursor: typeof snapshot.snapshotCursor === 'string' ? snapshot.snapshotCursor : null,
  };
}

function openDocumentIndexedDb(factory: IDBFactory, dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open IndexedDB document store'));
    request.onblocked = () => reject(new Error('IndexedDB document store open was blocked'));
  });
}

function idbGet(db: IDBDatabase, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to read IndexedDB document store'));
  });
}

function idbPut(db: IDBDatabase, storeName: string, key: string, value: DocumentStoreSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('failed to write IndexedDB document store'));
  });
}

function normaliseAccessBundle(value: unknown): DocumentAccessBundle {
  if (!value || typeof value !== 'object') throw new Error('invalid access bundle');
  const bundle = value as Partial<DocumentAccessBundle>;
  if (bundle.schema !== 'shippie.document.access-bundle.v1') throw new Error('unsupported access bundle schema');
  if (typeof bundle.createdAt !== 'string' || Number.isNaN(Date.parse(bundle.createdAt))) {
    throw new Error('invalid access bundle created-at');
  }
  if (!Array.isArray(bundle.documents) || bundle.documents.length === 0) {
    throw new Error('access bundle requires documents');
  }
  return {
    schema: 'shippie.document.access-bundle.v1',
    createdAt: bundle.createdAt,
    deviceLabel: typeof bundle.deviceLabel === 'string' ? bundle.deviceLabel : undefined,
    documents: bundle.documents.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('invalid access bundle document');
      const doc = item as Partial<DocumentAccessBundle['documents'][number]>;
      if (typeof doc.documentId !== 'string' || typeof doc.documentKey !== 'string') {
        throw new Error('invalid access bundle document');
      }
      return {
        documentId: doc.documentId,
        documentKey: doc.documentKey,
        cursor: typeof doc.cursor === 'string' ? doc.cursor : null,
        role: typeof doc.role === 'string' ? doc.role : undefined,
      };
    }),
  };
}

function normaliseAccessTransferRequest(value: unknown): AccessTransferRequest {
  if (!value || typeof value !== 'object') throw new Error('invalid access transfer request');
  const request = value as Partial<AccessTransferRequest>;
  if (request.schema !== 'shippie.document.access-transfer-request.v1') {
    throw new Error('unsupported access transfer request schema');
  }
  if (typeof request.recipientPublicKey !== 'string') throw new Error('invalid recipient public key');
  if (typeof request.createdAt !== 'string' || Number.isNaN(Date.parse(request.createdAt))) {
    throw new Error('invalid access transfer request created-at');
  }
  return {
    schema: request.schema,
    recipientPublicKey: request.recipientPublicKey,
    createdAt: request.createdAt,
    deviceLabel: typeof request.deviceLabel === 'string' ? request.deviceLabel : undefined,
  };
}

function normaliseWrappedAccessBundle(value: unknown): WrappedAccessBundle {
  if (!value || typeof value !== 'object') throw new Error('invalid wrapped access bundle');
  const bundle = value as Partial<WrappedAccessBundle>;
  if (bundle.schema !== 'shippie.document.wrapped-access-bundle.v1') {
    throw new Error('unsupported wrapped access bundle schema');
  }
  if (bundle.alg !== 'ECDH-P256-AES-256-GCM') throw new Error('unsupported wrapped access bundle algorithm');
  if (typeof bundle.senderPublicKey !== 'string') throw new Error('invalid sender public key');
  if (typeof bundle.nonce !== 'string') throw new Error('invalid nonce');
  if (typeof bundle.ciphertext !== 'string') throw new Error('invalid ciphertext');
  return {
    schema: bundle.schema,
    alg: bundle.alg,
    senderPublicKey: bundle.senderPublicKey,
    nonce: bundle.nonce,
    ciphertext: bundle.ciphertext,
  };
}

function normaliseEncryptedAttachment(value: unknown): EncryptedAttachmentPayload {
  if (!value || typeof value !== 'object') throw new Error('invalid encrypted attachment');
  const payload = value as Partial<EncryptedAttachmentPayload>;
  if (
    payload.schema !== SHIPPIE_ENCRYPTED_ATTACHMENT_SCHEMA ||
    payload.cipher !== 'AES-256-GCM' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.ciphertext !== 'string' ||
    typeof payload.byteLength !== 'number' ||
    payload.byteLength < 0 ||
    typeof payload.createdAt !== 'string' ||
    Number.isNaN(Date.parse(payload.createdAt))
  ) {
    throw new Error('invalid encrypted attachment');
  }
  return {
    schema: payload.schema,
    cipher: payload.cipher,
    nonce: payload.nonce,
    ciphertext: payload.ciphertext,
    byteLength: Math.floor(payload.byteLength),
    contentType: normaliseContentType(payload.contentType) ?? undefined,
    createdAt: payload.createdAt,
  };
}

function normaliseEncryptedAttachmentManifest(value: unknown): EncryptedAttachmentManifest {
  if (!value || typeof value !== 'object') throw new Error('invalid encrypted attachment manifest');
  const manifest = value as Partial<EncryptedAttachmentManifest>;
  if (
    manifest.schema !== SHIPPIE_ENCRYPTED_ATTACHMENT_MANIFEST_SCHEMA ||
    typeof manifest.attachmentId !== 'string' ||
    typeof manifest.createdAt !== 'string' ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    typeof manifest.totalByteLength !== 'number' ||
    manifest.totalByteLength < 0 ||
    !Array.isArray(manifest.chunks)
  ) {
    throw new Error('invalid encrypted attachment manifest');
  }
  return {
    schema: manifest.schema,
    attachmentId: manifest.attachmentId,
    createdAt: manifest.createdAt,
    totalByteLength: Math.floor(manifest.totalByteLength),
    contentType: normaliseContentType(manifest.contentType) ?? undefined,
    sha256: typeof manifest.sha256 === 'string' && BASE64URL_RE.test(manifest.sha256) ? manifest.sha256 : undefined,
    chunks: manifest.chunks.map((chunk) => {
      if (!chunk || typeof chunk !== 'object') throw new Error('invalid encrypted attachment chunk');
      const item = chunk as Partial<EncryptedAttachmentManifest['chunks'][number]>;
      if (typeof item.attachmentId !== 'string' || typeof item.byteLength !== 'number' || item.byteLength < 0) {
        throw new Error('invalid encrypted attachment chunk');
      }
      return {
        attachmentId: item.attachmentId,
        byteLength: Math.floor(item.byteLength),
        sha256: typeof item.sha256 === 'string' && BASE64URL_RE.test(item.sha256) ? item.sha256 : undefined,
      };
    }),
  };
}

async function bytesFromBody(bytes: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes instanceof Blob) return toArrayBufferBytes(new Uint8Array(await bytes.arrayBuffer()));
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return toArrayBufferBytes(bytes);
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function compareEnvelopeMarkers(a: EncryptedDocumentEvent, b: EncryptedDocumentEvent): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.eventId.localeCompare(b.eventId);
}

function compareSnapshotMarkers(a: EncryptedDocumentSnapshot, b: EncryptedDocumentSnapshot): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.snapshotId.localeCompare(b.snapshotId);
}

function compareEnvelopeToSnapshotMarker(envelope: EncryptedDocumentEvent, snapshot: DocumentSnapshot): number {
  if (!snapshot.lastEventCreatedAt || !snapshot.lastEventId) return 1;
  const byTime = envelope.createdAt.localeCompare(snapshot.lastEventCreatedAt);
  if (byTime !== 0) return byTime;
  return envelope.eventId.localeCompare(snapshot.lastEventId);
}

type NormalizedRealtimeSyncOptions = Required<
  Pick<
    RealtimeSyncOptions,
    | 'enabled'
    | 'pushDebounceMs'
    | 'pullIntervalMs'
    | 'idlePullIntervalMs'
    | 'maxBackoffMs'
    | 'maxJitterMs'
    | 'startOnOpen'
    | 'pullWhenHidden'
    | 'tabCoordination'
    | 'changeStream'
  >
> & {
  clock: RealtimeSyncClock;
  onStatus?: (status: DocumentSyncStatus) => void;
};

const DEFAULT_REALTIME_SYNC: Omit<NormalizedRealtimeSyncOptions, 'clock' | 'onStatus'> = {
  enabled: true,
  pushDebounceMs: 80,
  pullIntervalMs: 1_000,
  idlePullIntervalMs: 15_000,
  maxBackoffMs: 30_000,
  maxJitterMs: 250,
  startOnOpen: true,
  pullWhenHidden: false,
  tabCoordination: true,
  changeStream: true,
};

const defaultRealtimeClock: RealtimeSyncClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
};

function normaliseRealtimeSyncOptions(input: boolean | RealtimeSyncOptions | undefined): NormalizedRealtimeSyncOptions | null {
  if (!input) return null;
  const opts = typeof input === 'boolean' ? {} : input;
  if (opts.enabled === false) return null;
  return {
    ...DEFAULT_REALTIME_SYNC,
    ...opts,
    enabled: true,
    clock: opts.clock ?? defaultRealtimeClock,
  };
}

function createRealtimeSyncCoordinator(
  documentId: string,
  opts: NormalizedRealtimeSyncOptions,
): RealtimeSyncCoordinator | null {
  if (opts.tabCoordination && typeof opts.tabCoordination === 'object') return opts.tabCoordination;
  if (opts.tabCoordination === false) return null;
  const storage = safeRealtimeLocalStorage();
  if (!storage) return null;

  const instanceId = randomId('tab');
  const leaderKey = `shippie.doc.v0.leader:${documentId}`;
  const channelName = `shippie:doc-sync:${documentId}`;
  const lockTtlMs = Math.max(4_000, opts.pullIntervalMs * 2);
  const heartbeatMs = Math.max(1_000, Math.floor(lockTtlMs / 3));
  const syncRequestListeners = new Set<(reason: RealtimeSyncReason) => void>();
  const syncedListeners = new Set<(status: DocumentSyncStatus) => void>();
  let closed = false;
  let heartbeatTimer: unknown = null;
  let leader = false;
  let channel: BroadcastChannel | null = null;

  const readLock = (): { owner: string; expiresAt: number } | null => {
    try {
      const parsed = JSON.parse(storage.getItem(leaderKey) ?? 'null') as Partial<{ owner: string; expiresAt: number }> | null;
      if (!parsed || typeof parsed.owner !== 'string' || typeof parsed.expiresAt !== 'number') return null;
      return { owner: parsed.owner, expiresAt: parsed.expiresAt };
    } catch {
      return null;
    }
  };

  const writeLock = () => {
    storage.setItem(leaderKey, JSON.stringify({ owner: instanceId, expiresAt: opts.clock.now() + lockTtlMs }));
  };

  const claim = (): boolean => {
    if (closed) return false;
    const current = readLock();
    if (!current || current.owner === instanceId || current.expiresAt <= opts.clock.now()) {
      try {
        writeLock();
        leader = true;
        return true;
      } catch {
        leader = true;
        return true;
      }
    }
    leader = false;
    return false;
  };

  const scheduleHeartbeat = () => {
    if (closed) return;
    if (leader) {
      try {
        writeLock();
      } catch {
        // If the lock write fails, let this tab continue as a best-effort leader.
      }
    } else {
      claim();
    }
    heartbeatTimer = opts.clock.setTimeout(scheduleHeartbeat, heartbeatMs);
  };

  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => {
        const message = event.data as Partial<{
          type: 'sync-request' | 'synced';
          sourceId: string;
          reason: RealtimeSyncReason;
          status: DocumentSyncStatus;
        }>;
        if (!message || message.sourceId === instanceId) return;
        if (message.type === 'sync-request' && leader) {
          for (const listener of syncRequestListeners) listener(message.reason ?? 'timer');
        }
        if (message.type === 'synced' && message.status) {
          for (const listener of syncedListeners) listener(message.status);
        }
      };
    }
  } catch {
    channel = null;
  }

  claim();
  scheduleHeartbeat();

  return {
    isLeader() {
      return claim();
    },
    requestSync(reason) {
      try {
        channel?.postMessage({ type: 'sync-request', sourceId: instanceId, reason });
      } catch {
        // The follower will try to become leader on its next timer if needed.
      }
    },
    announceSynced(status) {
      try {
        channel?.postMessage({ type: 'synced', sourceId: instanceId, status });
      } catch {
        // Best-effort fan-out only.
      }
    },
    onSyncRequest(listener) {
      syncRequestListeners.add(listener);
      return () => syncRequestListeners.delete(listener);
    },
    onSynced(listener) {
      syncedListeners.add(listener);
      return () => syncedListeners.delete(listener);
    },
    close() {
      closed = true;
      if (heartbeatTimer !== null) opts.clock.clearTimeout(heartbeatTimer);
      try {
        if (readLock()?.owner === instanceId) storage.removeItem(leaderKey);
      } catch {
        // Best-effort cleanup.
      }
      channel?.close();
      syncRequestListeners.clear();
      syncedListeners.clear();
    },
  };
}

function safeRealtimeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isDocumentVisible(opts: NormalizedRealtimeSyncOptions | null): boolean {
  if (!opts) return true;
  if (opts.pullWhenHidden) return true;
  const documentLike = (globalThis as typeof globalThis & { document?: { visibilityState?: string } }).document;
  return documentLike?.visibilityState ? documentLike.visibilityState !== 'hidden' : true;
}

function isProbablyOnline(): boolean {
  const navigatorLike = (globalThis as typeof globalThis & { navigator?: { onLine?: boolean } }).navigator;
  return navigatorLike?.onLine !== false;
}

function subscribeRealtimeWakeups(onWake: (reason: RealtimeSyncReason) => void): Array<() => void> {
  const disposers: Array<() => void> = [];
  const windowLike = globalThis as typeof globalThis & {
    addEventListener?: (type: string, listener: EventListener) => void;
    removeEventListener?: (type: string, listener: EventListener) => void;
    document?: {
      visibilityState?: string;
      addEventListener?: (type: string, listener: EventListener) => void;
      removeEventListener?: (type: string, listener: EventListener) => void;
    };
  };
  const add = (target: {
    addEventListener?: (type: string, listener: EventListener) => void;
    removeEventListener?: (type: string, listener: EventListener) => void;
  } | undefined, type: string, listener: EventListener) => {
    if (!target?.addEventListener || !target.removeEventListener) return;
    target.addEventListener(type, listener);
    disposers.push(() => target.removeEventListener?.(type, listener));
  };
  add(windowLike, 'online', () => onWake('online'));
  add(windowLike, 'focus', () => onWake('visible'));
  add(windowLike.document, 'visibilitychange', () => {
    if (isProbablyOnline() && windowLike.document?.visibilityState !== 'hidden') onWake('visible');
  });
  return disposers;
}

class RuntimeDocument<TState, TPayload = unknown> implements DocumentHandle<TState, TPayload> {
  readonly documentId: string;
  private currentState: TState;
  private verifiedEvents: DocumentEvent<TPayload>[] = [];
  private encryptedEnvelopes: EncryptedDocumentEvent[] = [];
  private encryptedSnapshots: EncryptedDocumentSnapshot[] = [];
  private currentSnapshot: DocumentSnapshot<TState> | null = null;
  private pendingIds: string[] = [];
  private pendingSnapshotIdsValue: string[] = [];
  private syncCursor: string | null = null;
  private syncSnapshotCursor: string | null = null;
  private readonly realtime: NormalizedRealtimeSyncOptions | null;
  private readonly coordinator: RealtimeSyncCoordinator | null;
  private realtimeTimer: unknown = null;
  private realtimePullTimer: unknown = null;
  private changeStream: SealedChangeStreamHandle | null = null;
  private realtimeDisposers: Array<() => void> = [];
  private realtimeStopped = false;
  private syncInFlight: Promise<{ pushed: number; pulled: number; cursor: string | null }> | null = null;
  private syncAttempt = 0;
  private syncStatusValue: DocumentSyncStatus = {
    state: 'idle',
    pendingEvents: 0,
    pendingSnapshots: 0,
    lastSyncedAt: null,
    lastError: null,
    nextSyncAt: null,
    attempt: 0,
    reason: null,
  };

  constructor(
    private readonly opts: OpenDocumentOptions<TState, TPayload>,
    private readonly store: DocumentStore,
  ) {
    this.documentId = opts.documentId;
    this.currentState = opts.initialState;
    this.realtime = normaliseRealtimeSyncOptions(opts.realtime);
    this.coordinator = this.realtime && opts.sync ? createRealtimeSyncCoordinator(this.documentId, this.realtime) : null;
  }

  state(): TState {
    return this.currentState;
  }

  events(): readonly DocumentEvent<TPayload>[] {
    return this.verifiedEvents;
  }

  envelopes(): readonly EncryptedDocumentEvent[] {
    return this.encryptedEnvelopes;
  }

  snapshots(): readonly EncryptedDocumentSnapshot[] {
    return this.encryptedSnapshots;
  }

  pendingEventIds(): readonly string[] {
    return this.pendingIds;
  }

  pendingSnapshotIds(): readonly string[] {
    return this.pendingSnapshotIdsValue;
  }

  cursor(): string | null {
    return this.syncCursor;
  }

  snapshotCursor(): string | null {
    return this.syncSnapshotCursor;
  }

  latestSnapshot(): DocumentSnapshot<TState> | null {
    return this.currentSnapshot;
  }

  async append(input: AppendDocumentEventInput<TPayload>): Promise<DocumentEvent<TPayload>> {
    const parentIds = input.parentIds ?? this.verifiedEvents.slice(-8).map((event) => event.eventId);
    const envelope = await encryptDocumentEvent<TPayload>({
      documentId: this.documentId,
      documentKey: this.opts.documentKey,
      signing: this.opts.signing,
      kind: input.kind,
      payload: input.payload,
      parentIds,
      createdAt: input.createdAt,
      eventId: input.eventId,
    });
    await this.store.saveEnvelope(this.documentId, envelope);
    await this.store.markPending(this.documentId, envelope.eventId);
    await this.refresh();
    const event = this.verifiedEvents.find((item) => item.eventId === envelope.eventId);
    if (!event) throw new Error('appended document event could not be verified locally');
    this.requestSync('append');
    return event;
  }

  async createSnapshot(input: { snapshotId?: string; createdAt?: string } = {}): Promise<EncryptedDocumentSnapshot> {
    await this.refresh();
    const latestEvent = [...this.encryptedEnvelopes].sort(compareEnvelopeMarkers).at(-1) ?? null;
    const snapshot = await encryptDocumentSnapshot<TState>({
      documentId: this.documentId,
      documentKey: this.opts.documentKey,
      signing: this.opts.signing,
      state: this.currentState,
      reducerVersion: this.opts.reducerVersion,
      lastEventId: latestEvent?.eventId ?? null,
      lastEventCreatedAt: latestEvent?.createdAt ?? null,
      eventCount: this.currentSnapshot
        ? Math.max(this.currentSnapshot.eventCount + this.verifiedEvents.length, this.encryptedEnvelopes.length)
        : this.encryptedEnvelopes.length,
      snapshotId: input.snapshotId,
      createdAt: input.createdAt,
    });
    await this.store.saveSnapshot(this.documentId, snapshot);
    await this.store.markSnapshotPending(this.documentId, snapshot.snapshotId);
    await this.refresh();
    this.requestSync('snapshot');
    return snapshot;
  }

  async sync(): Promise<{ pushed: number; pulled: number; cursor: string | null }> {
    return this.runSync('manual');
  }

  syncStatus(): DocumentSyncStatus {
    return { ...this.syncStatusValue };
  }

  requestSync(reason: RealtimeSyncReason = 'manual'): void {
    if (!this.realtime || !this.opts.sync || this.realtimeStopped) return;
    this.clearRealtimeTimer();
    const delayMs = reason === 'append' || reason === 'snapshot' ? this.realtime.pushDebounceMs : 0;
    this.setSyncStatus({
      state: 'scheduled',
      reason,
      lastError: null,
      nextSyncAt: new Date(this.realtime.clock.now() + delayMs).toISOString(),
    });
    this.realtimeTimer = this.realtime.clock.setTimeout(() => this.runScheduledSync(reason), delayMs);
  }

  stopRealtimeSync(): void {
    this.realtimeStopped = true;
    this.clearRealtimeTimer();
    this.clearPullTimer();
    this.stopChangeStream();
    for (const dispose of this.realtimeDisposers.splice(0)) dispose();
    this.coordinator?.close();
  }

  startRealtimeSync(): void {
    if (!this.realtime || !this.opts.sync || this.realtimeStopped) return;
    this.setSyncStatus({ state: 'idle', lastError: null, nextSyncAt: null, reason: null });
    this.realtimeDisposers = subscribeRealtimeWakeups((reason) => {
      if (!this.realtimeStopped) this.requestSync(reason);
    });
    if (this.coordinator) {
      this.realtimeDisposers.push(
        this.coordinator.onSyncRequest((reason) => this.requestSync(reason)),
        this.coordinator.onSynced((status) => {
          void this.refresh().then(() => {
            this.setSyncStatus({
              state: 'idle',
              lastSyncedAt: status.lastSyncedAt,
              lastError: null,
              nextSyncAt: this.syncStatusValue.nextSyncAt,
              reason: status.reason,
            });
          });
        }),
      );
    }
    if (this.realtime.startOnOpen) this.requestSync('open');
    else this.schedulePull();
    this.startChangeStream();
  }

  private async performSync(reason: RealtimeSyncReason): Promise<{ pushed: number; pulled: number; cursor: string | null }> {
    if (!this.opts.sync) return { pushed: 0, pulled: 0, cursor: this.syncCursor };
    this.clearPullTimer();
    this.stopChangeStream();
    await this.refresh();
    this.setSyncStatus({
      state: 'syncing',
      reason,
      pendingEvents: this.pendingIds.length,
      pendingSnapshots: this.pendingSnapshotIdsValue.length,
      nextSyncAt: null,
      lastError: null,
    });

    try {
      if (this.encryptedEnvelopes.length === 0 && this.encryptedSnapshots.length === 0 && this.opts.sync.pullLatestSnapshot) {
        const latest = await this.opts.sync.pullLatestSnapshot(this.documentId);
        if (latest) {
          await this.store.saveSnapshot(this.documentId, latest);
          await this.refresh();
        }
      }

      const byId = new Map(this.encryptedEnvelopes.map((envelope) => [envelope.eventId, envelope]));
      const pendingEnvelopes: EncryptedDocumentEvent[] = [];
      for (const eventId of this.pendingIds) {
        const envelope = byId.get(eventId);
        if (envelope) pendingEnvelopes.push(envelope);
        else await this.store.clearPending(this.documentId, eventId);
      }

      let pushed = 0;
      let pushedCursor: string | null = null;
      let pushedSnapshotCursor: string | null = null;
      const snapshotsById = new Map(this.encryptedSnapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
      const hadPendingSnapshots = this.pendingSnapshotIdsValue.length > 0;
      if (pendingEnvelopes.length > 1 && this.opts.sync.pushEvents) {
        const result = await this.opts.sync.pushEvents(this.documentId, pendingEnvelopes);
        for (const envelope of pendingEnvelopes) {
          await this.store.clearPending(this.documentId, envelope.eventId);
        }
        pushed += result.events.length;
        pushedCursor = result.cursor;
      } else {
        for (const envelope of pendingEnvelopes) {
          const result = await this.opts.sync.pushEvent(envelope);
          await this.store.clearPending(this.documentId, envelope.eventId);
          pushed += 1;
          pushedCursor = result.cursor;
        }
      }

      for (const snapshotId of this.pendingSnapshotIdsValue) {
        const snapshot = snapshotsById.get(snapshotId);
        if (!snapshot) {
          await this.store.clearSnapshotPending(this.documentId, snapshotId);
          continue;
        }
        if (this.opts.sync.pushSnapshot) {
          const result = await this.opts.sync.pushSnapshot(snapshot);
          pushedSnapshotCursor = result.cursor;
        }
        await this.store.clearSnapshotPending(this.documentId, snapshotId);
      }

      if (pushedCursor || pushedSnapshotCursor) {
        if (pushedCursor) await this.store.setCursor(this.documentId, pushedCursor);
        if (pushedSnapshotCursor) await this.store.setSnapshotCursor(this.documentId, pushedSnapshotCursor);
        await this.refresh();
        this.syncAttempt = 0;
        this.setSyncStatus({
          state: 'idle',
          pendingEvents: this.pendingIds.length,
          pendingSnapshots: this.pendingSnapshotIdsValue.length,
          lastSyncedAt: new Date(this.realtime?.clock.now() ?? Date.now()).toISOString(),
          lastError: null,
          nextSyncAt: null,
          attempt: this.syncAttempt,
          reason,
        });
        this.coordinator?.announceSynced(this.syncStatus());
        this.schedulePull();
        this.startChangeStream();
        return { pushed, pulled: 0, cursor: this.syncCursor };
      }

      if (
        reason === 'timer' &&
        this.opts.sync.getChangeHint &&
        pendingEnvelopes.length === 0 &&
        !hadPendingSnapshots
      ) {
        const hint = await this.opts.sync.getChangeHint(this.documentId, {
          eventCursor: this.syncCursor,
          snapshotCursor: this.syncSnapshotCursor,
          eventCount: this.encryptedEnvelopes.length,
          snapshotCount: this.encryptedSnapshots.length,
        });
        if (!hint.changed) {
          await this.refresh();
          this.syncAttempt = 0;
          this.setSyncStatus({
            state: 'idle',
            pendingEvents: this.pendingIds.length,
            pendingSnapshots: this.pendingSnapshotIdsValue.length,
            lastSyncedAt: new Date(this.realtime?.clock.now() ?? Date.now()).toISOString(),
            lastError: null,
            nextSyncAt: null,
            attempt: this.syncAttempt,
            reason,
          });
          this.coordinator?.announceSynced(this.syncStatus());
          this.schedulePull();
          this.startChangeStream();
          return { pushed, pulled: 0, cursor: this.syncCursor };
        }
      }

      let pulled = 0;
      let cursor = this.syncCursor;
      do {
        const page = await this.opts.sync.pullEvents(this.documentId, { cursor });
        for (const envelope of page.events) {
          await this.store.saveEnvelope(this.documentId, envelope);
          pulled += byId.has(envelope.eventId) ? 0 : 1;
          byId.set(envelope.eventId, envelope);
        }
        cursor = page.cursor;
        await this.store.setCursor(this.documentId, cursor);
        if (!page.truncated) break;
      } while (cursor);

      await this.refresh();
      this.syncAttempt = 0;
      this.setSyncStatus({
        state: 'idle',
        pendingEvents: this.pendingIds.length,
        pendingSnapshots: this.pendingSnapshotIdsValue.length,
        lastSyncedAt: new Date(this.realtime?.clock.now() ?? Date.now()).toISOString(),
        lastError: null,
        nextSyncAt: null,
        attempt: this.syncAttempt,
        reason,
      });
      this.coordinator?.announceSynced(this.syncStatus());
      this.schedulePull();
      this.startChangeStream();
      return { pushed, pulled, cursor: this.syncCursor };
    } catch (err) {
      await this.refresh().catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      const retryMs = this.nextRetryDelay();
      this.setSyncStatus({
        state: isProbablyOnline() ? 'error' : 'offline',
        pendingEvents: this.pendingIds.length,
        pendingSnapshots: this.pendingSnapshotIdsValue.length,
        lastError: message,
        nextSyncAt: new Date((this.realtime?.clock.now() ?? Date.now()) + retryMs).toISOString(),
        attempt: this.syncAttempt,
        reason,
      });
      this.scheduleRetry(retryMs);
      throw err;
    }
  }

  async refresh(): Promise<void> {
    const snapshot = await this.store.load(this.documentId);
    const seen = new Set<string>();
    const envelopes = snapshot.envelopes
      .filter((envelope) => envelope.documentId === this.documentId)
      .filter((envelope) => {
        if (seen.has(envelope.eventId)) return false;
        seen.add(envelope.eventId);
        return true;
      });
    const snapshotSeen = new Set<string>();
    const sealedSnapshots = snapshot.snapshots
      .filter((item) => item.documentId === this.documentId)
      .filter((item) => {
        if (snapshotSeen.has(item.snapshotId)) return false;
        snapshotSeen.add(item.snapshotId);
        return true;
      });
    const latestSealedSnapshot = sealedSnapshots.sort(compareSnapshotMarkers).at(-1) ?? null;
    const latestSnapshot = latestSealedSnapshot
      ? (await decryptDocumentSnapshot<TState>({ documentKey: this.opts.documentKey, envelope: latestSealedSnapshot })).snapshot
      : null;
    const tailEnvelopes = latestSnapshot
      ? envelopes.filter((envelope) => compareEnvelopeToSnapshotMarker(envelope, latestSnapshot) > 0)
      : envelopes;
    const signed = await Promise.all(
      tailEnvelopes.map((envelope) => decryptDocumentEvent<TPayload>({ documentKey: this.opts.documentKey, envelope })),
    );
    const events = signed.map((item) => item.event);
    this.encryptedEnvelopes = envelopes;
    this.encryptedSnapshots = sealedSnapshots;
    this.verifiedEvents = [...events].sort(compareDocumentEvents);
    this.currentSnapshot = latestSnapshot;
    this.currentState = reduceDocumentEvents(
      latestSnapshot ? latestSnapshot.state : this.opts.initialState,
      this.verifiedEvents,
      this.opts.reducer,
    );
    this.pendingIds = snapshot.outboxEventIds.filter((id) => seen.has(id));
    this.pendingSnapshotIdsValue = snapshot.outboxSnapshotIds.filter((id) => snapshotSeen.has(id));
    this.syncCursor = snapshot.cursor;
    this.syncSnapshotCursor = snapshot.snapshotCursor;
    this.setSyncStatus({
      pendingEvents: this.pendingIds.length,
      pendingSnapshots: this.pendingSnapshotIdsValue.length,
    });
  }

  private async runScheduledSync(reason: RealtimeSyncReason): Promise<void> {
    if (!this.realtime || this.realtimeStopped) return;
    try {
      if (this.coordinator && !this.coordinator.isLeader()) {
        this.coordinator.requestSync(reason);
        this.setSyncStatus({
          state: 'scheduled',
          reason,
          nextSyncAt: null,
        });
        this.schedulePull();
        return;
      }
      if (!isProbablyOnline()) {
        const retryMs = this.nextRetryDelay();
        this.setSyncStatus({
          state: 'offline',
          reason,
          nextSyncAt: new Date(this.realtime.clock.now() + retryMs).toISOString(),
          attempt: this.syncAttempt,
        });
        this.scheduleRetry(retryMs);
        return;
      }
      await this.runSync(reason);
    } catch {
      // Status and retry are set in performSync. Scheduled sync must not leak
      // unhandled rejections into app code.
    }
  }

  private async runSync(reason: RealtimeSyncReason): Promise<{ pushed: number; pulled: number; cursor: string | null }> {
    if (this.syncInFlight) return this.syncInFlight;
    const promise = this.performSync(reason);
    this.syncInFlight = promise;
    try {
      return await promise;
    } finally {
      this.syncInFlight = null;
    }
  }

  private schedulePull(): void {
    if (!this.realtime || this.realtimeStopped || !this.opts.sync) return;
    this.clearPullTimer();
    const visible = isDocumentVisible(this.realtime);
    const delayMs = visible ? this.realtime.pullIntervalMs : this.realtime.idlePullIntervalMs;
    const jitterMs = this.randomJitter();
    this.setSyncStatus({
      state: this.syncStatusValue.state === 'syncing' ? 'syncing' : 'idle',
      nextSyncAt: new Date(this.realtime.clock.now() + delayMs + jitterMs).toISOString(),
    });
    this.realtimePullTimer = this.realtime.clock.setTimeout(() => this.runScheduledSync('timer'), delayMs + jitterMs);
  }

  private startChangeStream(): void {
    if (
      !this.realtime ||
      this.realtimeStopped ||
      !this.realtime.changeStream ||
      !this.opts.sync?.watchChangeHint ||
      !isProbablyOnline()
    ) {
      return;
    }
    if (this.coordinator && !this.coordinator.isLeader()) {
      this.stopChangeStream();
      return;
    }
    this.stopChangeStream();
    this.changeStream = this.opts.sync.watchChangeHint(this.documentId, {
      eventCursor: this.syncCursor,
      snapshotCursor: this.syncSnapshotCursor,
      eventCount: this.encryptedEnvelopes.length,
      snapshotCount: this.encryptedSnapshots.length,
      timeoutMs: Math.min(55_000, Math.max(10_000, this.realtime.idlePullIntervalMs * 2)),
      intervalMs: Math.max(750, Math.min(2_500, this.realtime.pullIntervalMs)),
      onChange: () => {
        this.changeStream = null;
        this.requestSync('visible');
      },
      onError: () => {
        this.changeStream = null;
      },
    });
  }

  private stopChangeStream(): void {
    this.changeStream?.close();
    this.changeStream = null;
  }

  private scheduleRetry(delayMs: number): void {
    if (!this.realtime || this.realtimeStopped || !this.opts.sync) return;
    this.clearRealtimeTimer();
    this.clearPullTimer();
    this.realtimeTimer = this.realtime.clock.setTimeout(() => this.runScheduledSync('timer'), delayMs);
  }

  private nextRetryDelay(): number {
    if (!this.realtime) return 0;
    this.syncAttempt += 1;
    const base = Math.min(this.realtime.maxBackoffMs, Math.max(1_000, this.realtime.pushDebounceMs * 2 ** this.syncAttempt));
    return Math.min(this.realtime.maxBackoffMs, base + this.randomJitter());
  }

  private randomJitter(): number {
    if (!this.realtime || this.realtime.maxJitterMs <= 0) return 0;
    return Math.floor(Math.random() * this.realtime.maxJitterMs);
  }

  private clearRealtimeTimer(): void {
    if (!this.realtime || this.realtimeTimer === null) return;
    this.realtime.clock.clearTimeout(this.realtimeTimer);
    this.realtimeTimer = null;
  }

  private clearPullTimer(): void {
    if (!this.realtime || this.realtimePullTimer === null) return;
    this.realtime.clock.clearTimeout(this.realtimePullTimer);
    this.realtimePullTimer = null;
  }

  private setSyncStatus(patch: Partial<DocumentSyncStatus>): void {
    this.syncStatusValue = {
      ...this.syncStatusValue,
      pendingEvents: this.pendingIds.length,
      pendingSnapshots: this.pendingSnapshotIdsValue.length,
      ...patch,
    };
    this.realtime?.onStatus?.({ ...this.syncStatusValue });
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = sortValue(record[key]);
  return out;
}

async function signCanonical(privateKey: CryptoKey, value: unknown): Promise<string> {
  const sig = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encodeUtf8(canonicalize(value)),
  );
  return base64UrlEncode(new Uint8Array(sig));
}

async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  const digest = await subtle().digest('SHA-256', toArrayBufferBytes(bytes));
  return base64UrlEncode(new Uint8Array(digest));
}

function randomId(prefix: string): string {
  const bytes = freshBytes(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${base64UrlEncode(bytes)}`;
}

function assertEnvelopeMatchesSignedEvent(envelope: EncryptedDocumentEvent, signed: SignedDocumentEvent): void {
  const event = signed.event;
  if (event.schema !== SHIPPIE_DOCUMENT_EVENT_SCHEMA) throw new Error('unsupported document event schema');
  if (signed.signatureAlg !== envelope.signatureAlg) throw new Error('signature algorithm mismatch');
  if (signed.authorPublicKey !== envelope.authorPublicKey) throw new Error('author public key mismatch');
  if (event.documentId !== envelope.documentId) throw new Error('document id mismatch');
  if (event.eventId !== envelope.eventId) throw new Error('event id mismatch');
  if (event.authorDeviceId !== envelope.authorDeviceId) throw new Error('author device mismatch');
  if (event.createdAt !== envelope.createdAt) throw new Error('created-at mismatch');
  if (event.parentIds.length !== envelope.parentIds.length) throw new Error('parent id mismatch');
  for (let i = 0; i < event.parentIds.length; i++) {
    if (event.parentIds[i] !== envelope.parentIds[i]) throw new Error('parent id mismatch');
  }
}

function assertEnvelopeMatchesSignedSnapshot(envelope: EncryptedDocumentSnapshot, signed: SignedDocumentSnapshot): void {
  const snapshot = signed.snapshot;
  if (snapshot.schema !== SHIPPIE_DOCUMENT_SNAPSHOT_SCHEMA) throw new Error('unsupported document snapshot schema');
  if (signed.signatureAlg !== envelope.signatureAlg) throw new Error('signature algorithm mismatch');
  if (signed.authorPublicKey !== envelope.authorPublicKey) throw new Error('author public key mismatch');
  if (snapshot.documentId !== envelope.documentId) throw new Error('document id mismatch');
  if (snapshot.snapshotId !== envelope.snapshotId) throw new Error('snapshot id mismatch');
  if (snapshot.authorDeviceId !== envelope.authorDeviceId) throw new Error('author device mismatch');
  if (snapshot.createdAt !== envelope.createdAt) throw new Error('created-at mismatch');
  if ((snapshot.reducerVersion ?? undefined) !== (envelope.reducerVersion ?? undefined)) {
    throw new Error('reducer version mismatch');
  }
  if (snapshot.lastEventId !== envelope.lastEventId) throw new Error('last event id mismatch');
  if (snapshot.lastEventCreatedAt !== envelope.lastEventCreatedAt) throw new Error('last event created-at mismatch');
  if (snapshot.eventCount !== envelope.eventCount) throw new Error('event count mismatch');
}
