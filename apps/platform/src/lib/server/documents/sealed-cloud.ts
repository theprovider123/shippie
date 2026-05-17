import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';

export const SEALED_DOCUMENT_EVENT_SCHEMA = 'shippie.document.encrypted-event.v1';
export const SEALED_DOCUMENT_SNAPSHOT_SCHEMA = 'shippie.document.encrypted-snapshot.v1';

export interface EncryptedDocumentEventEnvelope {
  schema: typeof SEALED_DOCUMENT_EVENT_SCHEMA;
  documentId: string;
  eventId: string;
  parentIds: string[];
  authorDeviceId: string;
  authorPublicKey: string;
  createdAt: string;
  cipher: string;
  signatureAlg: string;
  nonce: string;
  ciphertext: string;
}

export interface EncryptedDocumentSnapshotEnvelope {
  schema: typeof SEALED_DOCUMENT_SNAPSHOT_SCHEMA;
  documentId: string;
  snapshotId: string;
  authorDeviceId: string;
  authorPublicKey: string;
  createdAt: string;
  reducerVersion?: string;
  lastEventId: string | null;
  lastEventCreatedAt: string | null;
  eventCount: number;
  cipher: string;
  signatureAlg: string;
  nonce: string;
  ciphertext: string;
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
}

export type SealedDocumentBudgetStatus = 'healthy' | 'watch' | 'limited';

export interface SealedDocumentBudgetGauge {
  used: number;
  limit: number;
  remaining: number;
  ratio: number;
}

export interface SealedDocumentBudgetHealth {
  day: string;
  status: SealedDocumentBudgetStatus;
  warnings: string[];
  events: SealedDocumentBudgetGauge;
  eventBytes: SealedDocumentBudgetGauge;
  attachmentBytes: SealedDocumentBudgetGauge;
}

export interface SealedDocumentEnv {
  DOCUMENTS?: R2Bucket;
  PLATFORM_ASSETS?: R2Bucket;
  CACHE?: KVNamespace;
  SEALED_DOCS_ENABLED?: string;
  SEALED_DOC_CHANGE_STREAM_ENABLED?: string;
  SEALED_DOC_DAILY_EVENT_LIMIT?: string;
  SEALED_DOC_DAILY_BYTE_LIMIT?: string;
  SEALED_DOC_IP_DAILY_EVENT_LIMIT?: string;
  SEALED_DOC_DEVICE_DAILY_EVENT_LIMIT?: string;
  SEALED_DOC_DEVICE_DAILY_BYTE_LIMIT?: string;
  SEALED_DOC_MAX_ATTACHMENT_BYTES?: string;
  SEALED_DOC_DAILY_ATTACHMENT_BYTE_LIMIT?: string;
  SEALED_DOC_DEVICE_DAILY_ATTACHMENT_BYTE_LIMIT?: string;
}

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;

interface SealedWriteOptions {
  request?: Request;
  now?: Date;
  eventCount?: number;
  waitUntil?: BackgroundTaskScheduler;
}

interface SealedStoreOptions {
  request?: Request;
  now?: Date;
  waitUntil?: BackgroundTaskScheduler;
}

export interface StoreSealedEventResult {
  key: string;
  cursor: string;
  stored: boolean;
}

export interface StoreSealedEventBatchResult {
  events: StoreSealedEventResult[];
  stored: number;
  cursor: string | null;
}

export interface StoreSealedSnapshotResult {
  key: string;
  cursor: string;
  stored: boolean;
}

export interface SealedAttachmentManifest {
  schema: 'shippie.document.attachment.v1';
  documentId: string;
  attachmentId: string;
  createdAt: string;
  cipher: 'AES-256-GCM';
  nonce: string;
  byteLength: number;
  contentType?: string;
  sha256?: string;
}

export interface StoreSealedAttachmentResult {
  key: string;
  stored: boolean;
  byteLength: number;
}

const MAX_EVENT_BYTES = 256 * 1024;
const MAX_EVENT_BATCH_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_BATCH_COUNT = 100;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_LIST_LIMIT = 100;
const R2_LIST_PAGE_LIMIT = 1_000;
const DEFAULT_DAILY_EVENT_LIMIT = 20_000;
const DEFAULT_DAILY_BYTE_LIMIT = 100 * 1024 * 1024;
const DEFAULT_IP_DAILY_EVENT_LIMIT = 50_000;
const DEFAULT_DEVICE_DAILY_EVENT_LIMIT = 10_000;
const DEFAULT_DEVICE_DAILY_BYTE_LIMIT = 250 * 1024 * 1024;
const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const DEFAULT_DAILY_ATTACHMENT_BYTE_LIMIT = 1024 * 1024 * 1024;
const DEFAULT_DEVICE_DAILY_ATTACHMENT_BYTE_LIMIT = 512 * 1024 * 1024;
const DOC_ID_RE = /^[A-Za-z0-9_-]{6,160}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,240}$/;
const ATTACHMENT_ID_RE = /^[A-Za-z0-9_.-]{1,240}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const EVENT_KEYS = new Set([
  'schema',
  'documentId',
  'eventId',
  'parentIds',
  'authorDeviceId',
  'authorPublicKey',
  'createdAt',
  'cipher',
  'signatureAlg',
  'nonce',
  'ciphertext',
]);
const SNAPSHOT_KEYS = new Set([
  'schema',
  'documentId',
  'snapshotId',
  'authorDeviceId',
  'authorPublicKey',
  'createdAt',
  'reducerVersion',
  'lastEventId',
  'lastEventCreatedAt',
  'eventCount',
  'cipher',
  'signatureAlg',
  'nonce',
  'ciphertext',
]);

export function documentBucket(env: SealedDocumentEnv): R2Bucket | null {
  if (env.SEALED_DOCS_ENABLED === 'false') return null;
  return env.DOCUMENTS ?? env.PLATFORM_ASSETS ?? null;
}

export function sealedChangeStreamEnabled(env: SealedDocumentEnv): boolean {
  return env.SEALED_DOCS_ENABLED !== 'false' && env.SEALED_DOC_CHANGE_STREAM_ENABLED !== 'false';
}

export function assertDocumentId(value: string): void {
  if (!DOC_ID_RE.test(value)) throw new Error('invalid document id');
}

export async function parseSealedEventRequest(request: Request): Promise<EncryptedDocumentEventEnvelope> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_EVENT_BYTES) throw new Error('event too large');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BYTES) throw new Error('event too large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }
  return validateSealedEvent(parsed);
}

export async function parseSealedEventBatchRequest(
  request: Request,
): Promise<{ events: EncryptedDocumentEventEnvelope[]; batch: boolean }> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_EVENT_BATCH_BYTES) throw new Error('event batch too large');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BATCH_BYTES) throw new Error('event batch too large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }

  if (!Array.isArray(parsed)) return { events: [validateSealedEvent(parsed)], batch: false };
  if (parsed.length < 1) throw new Error('event batch is empty');
  if (parsed.length > MAX_EVENT_BATCH_COUNT) throw new Error('event batch too large');
  return { events: parsed.map(validateSealedEvent), batch: true };
}

export function validateSealedEvent(value: unknown): EncryptedDocumentEventEnvelope {
  if (!value || typeof value !== 'object') throw new Error('event must be an object');
  for (const key of Object.keys(value)) {
    if (!EVENT_KEYS.has(key)) throw new Error(`unexpected plaintext field: ${key}`);
  }
  const event = value as Partial<EncryptedDocumentEventEnvelope>;
  if (event.schema !== SEALED_DOCUMENT_EVENT_SCHEMA) throw new Error('unsupported event schema');
  if (typeof event.documentId !== 'string') throw new Error('missing document id');
  assertDocumentId(event.documentId);
  if (!isToken(event.eventId)) throw new Error('invalid event id');
  if (!Array.isArray(event.parentIds) || event.parentIds.some((id) => !isToken(id))) {
    throw new Error('invalid parent ids');
  }
  if (!isToken(event.authorDeviceId)) throw new Error('invalid author device id');
  if (!isToken(event.authorPublicKey)) throw new Error('invalid author public key');
  if (typeof event.createdAt !== 'string' || Number.isNaN(Date.parse(event.createdAt))) {
    throw new Error('invalid created-at');
  }
  if (event.cipher !== 'AES-256-GCM') throw new Error('unsupported cipher');
  if (event.signatureAlg !== 'ECDSA-P256-SHA256') throw new Error('unsupported signature algorithm');
  if (!isBase64Url(event.nonce)) throw new Error('invalid nonce');
  if (!isBase64Url(event.ciphertext)) throw new Error('invalid ciphertext');
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

export async function parseSealedSnapshotRequest(request: Request): Promise<EncryptedDocumentSnapshotEnvelope> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_SNAPSHOT_BYTES) throw new Error('snapshot too large');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_SNAPSHOT_BYTES) throw new Error('snapshot too large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }
  return validateSealedSnapshot(parsed);
}

export function validateSealedSnapshot(value: unknown): EncryptedDocumentSnapshotEnvelope {
  if (!value || typeof value !== 'object') throw new Error('snapshot must be an object');
  for (const key of Object.keys(value)) {
    if (!SNAPSHOT_KEYS.has(key)) throw new Error(`unexpected plaintext field: ${key}`);
  }
  const snapshot = value as Partial<EncryptedDocumentSnapshotEnvelope>;
  if (snapshot.schema !== SEALED_DOCUMENT_SNAPSHOT_SCHEMA) throw new Error('unsupported snapshot schema');
  if (typeof snapshot.documentId !== 'string') throw new Error('missing document id');
  assertDocumentId(snapshot.documentId);
  if (!isToken(snapshot.snapshotId)) throw new Error('invalid snapshot id');
  if (!isToken(snapshot.authorDeviceId)) throw new Error('invalid author device id');
  if (!isToken(snapshot.authorPublicKey)) throw new Error('invalid author public key');
  if (typeof snapshot.createdAt !== 'string' || Number.isNaN(Date.parse(snapshot.createdAt))) {
    throw new Error('invalid created-at');
  }
  if (snapshot.reducerVersion !== undefined && !isToken(snapshot.reducerVersion)) {
    throw new Error('invalid reducer version');
  }
  if (snapshot.lastEventId !== null && snapshot.lastEventId !== undefined && !isToken(snapshot.lastEventId)) {
    throw new Error('invalid last event id');
  }
  if (
    snapshot.lastEventCreatedAt !== null &&
    snapshot.lastEventCreatedAt !== undefined &&
    (typeof snapshot.lastEventCreatedAt !== 'string' || Number.isNaN(Date.parse(snapshot.lastEventCreatedAt)))
  ) {
    throw new Error('invalid last event created-at');
  }
  if (typeof snapshot.eventCount !== 'number' || !Number.isFinite(snapshot.eventCount) || snapshot.eventCount < 0) {
    throw new Error('invalid event count');
  }
  if (snapshot.cipher !== 'AES-256-GCM') throw new Error('unsupported cipher');
  if (snapshot.signatureAlg !== 'ECDSA-P256-SHA256') throw new Error('unsupported signature algorithm');
  if (!isBase64Url(snapshot.nonce)) throw new Error('invalid nonce');
  if (!isBase64Url(snapshot.ciphertext)) throw new Error('invalid ciphertext');
  return {
    schema: snapshot.schema,
    documentId: snapshot.documentId,
    snapshotId: snapshot.snapshotId,
    authorDeviceId: snapshot.authorDeviceId,
    authorPublicKey: snapshot.authorPublicKey,
    createdAt: snapshot.createdAt,
    reducerVersion: snapshot.reducerVersion,
    lastEventId: snapshot.lastEventId ?? null,
    lastEventCreatedAt: snapshot.lastEventCreatedAt ?? null,
    eventCount: Math.floor(snapshot.eventCount),
    cipher: snapshot.cipher,
    signatureAlg: snapshot.signatureAlg,
    nonce: snapshot.nonce,
    ciphertext: snapshot.ciphertext,
  };
}

export async function storeSealedEvent(
  env: SealedDocumentEnv,
  documentId: string,
  event: EncryptedDocumentEventEnvelope,
  opts: SealedStoreOptions = {},
): Promise<StoreSealedEventResult> {
  assertDocumentId(documentId);
  if (event.documentId !== documentId) throw new Error('document id mismatch');
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');

  const key = eventKey(event);
  const existing = await bucket.head(key);
  if (!existing) {
    const serialised = JSON.stringify(event);
    await enforceSealedWriteBudget(env, documentId, serialisedByteLength(serialised), opts);
    await bucket.put(key, serialised, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: {
        documentId,
        eventId: event.eventId,
        authorDeviceId: event.authorDeviceId,
        createdAt: event.createdAt,
      },
    });
    await maybeRunInBackground(opts.waitUntil, env.CACHE?.put(
      healthKey(documentId),
      JSON.stringify({ documentId, lastEventId: event.eventId, lastSyncedAt: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    ));
    await updateDocumentManifest(env, documentId, {
      eventCountDelta: 1,
      latestEventId: event.eventId,
      latestEventCursor: key,
    });
  }
  return { key, cursor: key, stored: !existing };
}

export async function storeSealedEventBatch(
  env: SealedDocumentEnv,
  documentId: string,
  events: readonly EncryptedDocumentEventEnvelope[],
  opts: SealedStoreOptions = {},
): Promise<StoreSealedEventBatchResult> {
  assertDocumentId(documentId);
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');

  const candidates = events.map((event) => {
    if (event.documentId !== documentId) throw new Error('document id mismatch');
    return {
      event,
      key: eventKey(event),
      serialised: JSON.stringify(event),
    };
  });
  const existing = await Promise.all(candidates.map((candidate) => bucket.head(candidate.key)));
  const fresh = candidates.filter((_, index) => !existing[index]);

  if (fresh.length > 0) {
    const currentManifest = env.CACHE ? readSealedDocumentManifest(env, documentId) : undefined;
    const totalBytes = fresh.reduce((sum, candidate) => sum + serialisedByteLength(candidate.serialised), 0);
    await enforceSealedWriteBudget(env, documentId, totalBytes, {
      ...opts,
      eventCount: fresh.length,
    });
    await Promise.all(
      fresh.map((candidate) =>
        bucket.put(candidate.key, candidate.serialised, {
          httpMetadata: { contentType: 'application/json; charset=utf-8' },
          customMetadata: {
            documentId,
            eventId: candidate.event.eventId,
            authorDeviceId: candidate.event.authorDeviceId,
            createdAt: candidate.event.createdAt,
          },
        }),
      ),
    );
    const last = fresh.at(-1)!.event;
    await maybeRunInBackground(opts.waitUntil, env.CACHE?.put(
      healthKey(documentId),
      JSON.stringify({ documentId, lastEventId: last.eventId, lastSyncedAt: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    ));
    await updateDocumentManifest(
      env,
      documentId,
      {
        eventCountDelta: fresh.length,
        latestEventId: last.eventId,
        latestEventCursor: fresh.at(-1)!.key,
      },
      { current: currentManifest },
    );
  }

  const results = candidates.map((candidate, index) => ({
    key: candidate.key,
    cursor: candidate.key,
    stored: !existing[index],
  }));
  return {
    events: results,
    stored: results.filter((result) => result.stored).length,
    cursor: results.at(-1)?.cursor ?? null,
  };
}

export async function storeSealedSnapshot(
  env: SealedDocumentEnv,
  documentId: string,
  snapshot: EncryptedDocumentSnapshotEnvelope,
  opts: SealedStoreOptions = {},
): Promise<StoreSealedSnapshotResult> {
  assertDocumentId(documentId);
  if (snapshot.documentId !== documentId) throw new Error('document id mismatch');
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');

  const key = snapshotKey(snapshot);
  const existing = await bucket.head(key);
  if (!existing) {
    const serialised = JSON.stringify(snapshot);
    await enforceSealedWriteBudget(env, documentId, serialisedByteLength(serialised), opts);
    await bucket.put(key, serialised, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: {
        documentId,
        snapshotId: snapshot.snapshotId,
        authorDeviceId: snapshot.authorDeviceId,
        createdAt: snapshot.createdAt,
      },
    });
    await updateDocumentManifest(env, documentId, {
      snapshotCountDelta: 1,
      latestSnapshotId: snapshot.snapshotId,
      latestSnapshotCursor: key,
    });
  }
  return { key, cursor: key, stored: !existing };
}

export async function storeSealedAttachment(
  env: SealedDocumentEnv,
  documentId: string,
  attachmentId: string,
  request: Request,
  opts: { now?: Date } = {},
): Promise<StoreSealedAttachmentResult> {
  assertDocumentId(documentId);
  if (!isAttachmentId(attachmentId)) throw new Error('invalid attachment id');
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');

  const maxAttachmentBytes = numberFromEnv(env.SEALED_DOC_MAX_ATTACHMENT_BYTES, DEFAULT_MAX_ATTACHMENT_BYTES);
  const lengthHeader = request.headers.get('content-length');
  const declaredLength = lengthHeader ? Number(lengthHeader) : null;
  if (declaredLength !== null && (!Number.isFinite(declaredLength) || declaredLength > maxAttachmentBytes)) {
    throw new Error('attachment too large');
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxAttachmentBytes) throw new Error('attachment too large');
  await enforceSealedAttachmentBudget(env, documentId, bytes.byteLength, { request, now: opts.now });

  const key = attachmentKey(documentId, attachmentId);
  const existing = await bucket.head(key);
  if (!existing) {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: sealedAttachmentContentType(request) },
      customMetadata: {
        documentId,
        attachmentId,
        sealed: 'true',
        byteLength: String(bytes.byteLength),
      },
    });
    await env.CACHE?.put(
      attachmentHealthKey(documentId),
      JSON.stringify({ documentId, lastAttachmentId: attachmentId, lastSyncedAt: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    );
    await updateDocumentManifest(env, documentId, {
      attachmentCountDelta: 1,
      lastAttachmentId: attachmentId,
    });
  }
  return { key, stored: !existing, byteLength: bytes.byteLength };
}

export async function readSealedAttachment(
  env: SealedDocumentEnv,
  documentId: string,
  attachmentId: string,
): Promise<Response> {
  assertDocumentId(documentId);
  if (!isAttachmentId(attachmentId)) throw new Error('invalid attachment id');
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');
  const object = await bucket.get(attachmentKey(documentId, attachmentId));
  if (!object) throw new Error('attachment not found');
  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType;
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-shippie-sealed-copy', '1');
  return new Response(object.body as unknown as BodyInit, { headers });
}

export async function enforceSealedWriteBudget(
  env: SealedDocumentEnv,
  documentId: string,
  eventBytes: number,
  opts: SealedWriteOptions = {},
): Promise<void> {
  if (!env.CACHE) return;
  const now = opts.now ?? new Date();
  const eventCount = Math.max(1, Math.floor(opts.eventCount ?? 1));
  const day = now.toISOString().slice(0, 10);
  const documentLimit = numberFromEnv(env.SEALED_DOC_DAILY_EVENT_LIMIT, DEFAULT_DAILY_EVENT_LIMIT);
  const byteLimit = numberFromEnv(env.SEALED_DOC_DAILY_BYTE_LIMIT, DEFAULT_DAILY_BYTE_LIMIT);
  const ipLimit = numberFromEnv(env.SEALED_DOC_IP_DAILY_EVENT_LIMIT, DEFAULT_IP_DAILY_EVENT_LIMIT);
  const deviceEventLimit = numberFromEnv(env.SEALED_DOC_DEVICE_DAILY_EVENT_LIMIT, DEFAULT_DEVICE_DAILY_EVENT_LIMIT);
  const deviceByteLimit = numberFromEnv(env.SEALED_DOC_DEVICE_DAILY_BYTE_LIMIT, DEFAULT_DEVICE_DAILY_BYTE_LIMIT);

  const documentKey = budgetKey('document', `${documentId}:${day}`);
  const documentBudgetPromise = readBudget(env.CACHE, documentKey);
  const ip = clientAddress(opts.request);
  const ipHashPromise = sha256Base64Url(ip);
  const deviceKey = budgetKey('device', `${hashableDeviceId(opts.request)}:${day}`);
  const deviceBudgetPromise = readBudget(env.CACHE, deviceKey);
  let ipKey = '';
  const ipBudgetPromise = ipHashPromise.then((ipHash) => {
    ipKey = budgetKey('ip', `${ipHash}:${day}`);
    return readBudget(env.CACHE!, ipKey);
  });
  const [documentBudget, ipBudget, deviceBudget] = await Promise.all([
    documentBudgetPromise,
    ipBudgetPromise,
    deviceBudgetPromise,
  ]);
  if (documentBudget.events + eventCount > documentLimit || documentBudget.bytes + eventBytes > byteLimit) {
    throw new Error('sealed sync write budget exceeded');
  }

  if (ipBudget.events + eventCount > ipLimit) {
    throw new Error('sealed sync write budget exceeded');
  }

  if (deviceBudget.events + eventCount > deviceEventLimit || deviceBudget.bytes + eventBytes > deviceByteLimit) {
    throw new Error('sealed sync write budget exceeded');
  }

  const commit = Promise.all([
    writeBudget(env.CACHE, documentKey, {
      events: documentBudget.events + eventCount,
      bytes: documentBudget.bytes + eventBytes,
    }),
    writeBudget(env.CACHE, ipKey, {
      events: ipBudget.events + eventCount,
      bytes: ipBudget.bytes + eventBytes,
    }),
    writeBudget(env.CACHE, deviceKey, {
      events: deviceBudget.events + eventCount,
      bytes: deviceBudget.bytes + eventBytes,
    }),
  ]).then(() => undefined);
  await maybeRunInBackground(opts.waitUntil, commit);
}

export async function enforceSealedAttachmentBudget(
  env: SealedDocumentEnv,
  documentId: string,
  attachmentBytes: number,
  opts: { request?: Request; now?: Date } = {},
): Promise<void> {
  if (!env.CACHE) return;
  const now = opts.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const byteLimit = numberFromEnv(
    env.SEALED_DOC_DAILY_ATTACHMENT_BYTE_LIMIT,
    DEFAULT_DAILY_ATTACHMENT_BYTE_LIMIT,
  );
  const deviceByteLimit = numberFromEnv(
    env.SEALED_DOC_DEVICE_DAILY_ATTACHMENT_BYTE_LIMIT,
    DEFAULT_DEVICE_DAILY_ATTACHMENT_BYTE_LIMIT,
  );
  const documentKey = budgetKey('attachment', `${documentId}:${day}`);
  const documentBudget = await readBudget(env.CACHE, documentKey);
  if (documentBudget.bytes + attachmentBytes > byteLimit) {
    throw new Error('sealed attachment budget exceeded');
  }

  const deviceKey = budgetKey('device-attachment', `${hashableDeviceId(opts.request)}:${day}`);
  const deviceBudget = await readBudget(env.CACHE, deviceKey);
  if (deviceBudget.bytes + attachmentBytes > deviceByteLimit) {
    throw new Error('sealed attachment budget exceeded');
  }

  await Promise.all([
    writeBudget(env.CACHE, documentKey, {
      events: documentBudget.events + 1,
      bytes: documentBudget.bytes + attachmentBytes,
    }),
    writeBudget(env.CACHE, deviceKey, {
      events: deviceBudget.events + 1,
      bytes: deviceBudget.bytes + attachmentBytes,
    }),
  ]);
}

export async function listSealedEvents(
  env: SealedDocumentEnv,
  documentId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<{ events: EncryptedDocumentEventEnvelope[]; cursor: string | null; truncated: boolean }> {
  assertDocumentId(documentId);
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');
  const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, opts.limit ?? 50));
  const prefix = eventPrefix(documentId);
  const listed = await listObjectKeysAfter(bucket, prefix, opts.cursor ?? null, limit);
  const keys = listed.keys;
  const events = await Promise.all(
    keys.map(async (key) => {
      const object = await bucket.get(key);
      const text = await object?.text();
      if (!text) return null;
      try {
        return validateSealedEvent(JSON.parse(text));
      } catch {
        return null;
      }
    }),
  );
  return {
    events: events.filter((event): event is EncryptedDocumentEventEnvelope => event !== null),
    cursor: listed.cursor,
    truncated: listed.truncated,
  };
}

export async function listSealedSnapshots(
  env: SealedDocumentEnv,
  documentId: string,
  opts: { cursor?: string | null; limit?: number; latest?: boolean } = {},
): Promise<{ snapshots: EncryptedDocumentSnapshotEnvelope[]; cursor: string | null; truncated: boolean }> {
  assertDocumentId(documentId);
  const bucket = documentBucket(env);
  if (!bucket) throw new Error('document storage unavailable');
  const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, opts.limit ?? 20));
  const prefix = snapshotPrefix(documentId);
  const listed = await listObjectKeysAfter(bucket, prefix, opts.cursor ?? null, opts.latest ? MAX_LIST_LIMIT : limit);
  const selectedKeys = opts.latest ? listed.keys.slice(-1) : listed.keys;
  const snapshots = await Promise.all(
    selectedKeys.map(async (key) => {
      const object = await bucket.get(key);
      const text = await object?.text();
      if (!text) return null;
      try {
        return validateSealedSnapshot(JSON.parse(text));
      } catch {
        return null;
      }
    }),
  );
  return {
    snapshots: snapshots.filter((snapshot): snapshot is EncryptedDocumentSnapshotEnvelope => snapshot !== null),
    cursor: opts.latest ? selectedKeys.at(-1) ?? normaliseObjectKeyCursor(prefix, opts.cursor ?? null) : listed.cursor,
    truncated: opts.latest ? false : listed.truncated,
  };
}

async function listObjectKeysAfter(
  bucket: R2Bucket,
  prefix: string,
  cursor: string | null,
  limit: number,
): Promise<{ keys: string[]; cursor: string | null; truncated: boolean }> {
  const after = normaliseObjectKeyCursor(prefix, cursor);
  const selected: string[] = [];
  let r2Cursor: string | undefined;
  let truncated = false;

  do {
    const page = await bucket.list({ prefix, cursor: r2Cursor, limit: R2_LIST_PAGE_LIMIT });
    const pageKeys = page.objects.map((object) => object.key).sort();
    for (const key of pageKeys) {
      if (after && key <= after) continue;
      selected.push(key);
      if (selected.length > limit) break;
    }
    r2Cursor = page.truncated ? page.cursor : undefined;
    truncated = selected.length > limit || Boolean(r2Cursor);
  } while (r2Cursor && selected.length <= limit);

  const keys = selected.slice(0, limit);
  return {
    keys,
    cursor: keys.at(-1) ?? after,
    truncated,
  };
}

function normaliseObjectKeyCursor(prefix: string, cursor: string | null): string | null {
  return typeof cursor === 'string' && cursor.startsWith(prefix) ? cursor : null;
}

export async function readSealedDocumentHealth(env: SealedDocumentEnv, documentId: string): Promise<unknown | null> {
  assertDocumentId(documentId);
  const raw = await env.CACHE?.get(healthKey(documentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readSealedDocumentBudgetHealth(
  env: SealedDocumentEnv,
  documentId: string,
  opts: { now?: Date } = {},
): Promise<SealedDocumentBudgetHealth | null> {
  assertDocumentId(documentId);
  if (!env.CACHE) return null;
  const day = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const documentBudget = await readBudget(env.CACHE, budgetKey('document', `${documentId}:${day}`));
  const attachmentBudget = await readBudget(env.CACHE, budgetKey('attachment', `${documentId}:${day}`));
  const events = budgetGauge(
    documentBudget.events,
    numberFromEnv(env.SEALED_DOC_DAILY_EVENT_LIMIT, DEFAULT_DAILY_EVENT_LIMIT),
  );
  const eventBytes = budgetGauge(
    documentBudget.bytes,
    numberFromEnv(env.SEALED_DOC_DAILY_BYTE_LIMIT, DEFAULT_DAILY_BYTE_LIMIT),
  );
  const attachmentBytes = budgetGauge(
    attachmentBudget.bytes,
    numberFromEnv(env.SEALED_DOC_DAILY_ATTACHMENT_BYTE_LIMIT, DEFAULT_DAILY_ATTACHMENT_BYTE_LIMIT),
  );
  const { status, warnings } = budgetStatus([
    ['sync writes', events],
    ['sync bytes', eventBytes],
    ['media bytes', attachmentBytes],
  ]);
  return {
    day,
    status,
    warnings,
    events,
    eventBytes,
    attachmentBytes,
  };
}

export async function readSealedDocumentManifest(
  env: SealedDocumentEnv,
  documentId: string,
): Promise<SealedDocumentManifest> {
  assertDocumentId(documentId);
  const raw = await env.CACHE?.get(manifestKey(documentId));
  if (!raw) return emptyManifest(documentId);
  try {
    return normaliseManifest(documentId, JSON.parse(raw));
  } catch {
    return emptyManifest(documentId);
  }
}

export async function readSealedDocumentChangeHint(
  env: SealedDocumentEnv,
  documentId: string,
): Promise<SealedDocumentChangeHint> {
  const manifest = await readSealedDocumentManifest(env, documentId);
  return {
    schema: 'shippie.document.change-hint.v1',
    documentId: manifest.documentId,
    eventCount: manifest.eventCount,
    snapshotCount: manifest.snapshotCount,
    attachmentCount: manifest.attachmentCount,
    latestEventId: manifest.latestEventId,
    latestEventCursor: manifest.latestEventCursor,
    latestSnapshotId: manifest.latestSnapshotId,
    latestSnapshotCursor: manifest.latestSnapshotCursor,
    updatedAt: manifest.updatedAt,
  };
}

export function hasSealedDocumentChanged(
  hint: SealedDocumentChangeHint,
  opts: {
    eventCursor?: string | null;
    snapshotCursor?: string | null;
    eventCount?: number | null;
    snapshotCount?: number | null;
  },
): boolean {
  return (
    (Number.isFinite(opts.eventCount) && hint.eventCount !== Math.max(0, Math.floor(opts.eventCount ?? 0))) ||
    (Number.isFinite(opts.snapshotCount) && hint.snapshotCount !== Math.max(0, Math.floor(opts.snapshotCount ?? 0))) ||
    (opts.eventCursor !== undefined && (hint.latestEventCursor ?? null) !== (opts.eventCursor ?? null)) ||
    (opts.snapshotCursor !== undefined && (hint.latestSnapshotCursor ?? null) !== (opts.snapshotCursor ?? null))
  );
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

function isAttachmentId(value: unknown): value is string {
  return typeof value === 'string' && ATTACHMENT_ID_RE.test(value);
}

function isBase64Url(value: unknown): value is string {
  return typeof value === 'string' && BASE64URL_RE.test(value);
}

function sealedAttachmentContentType(request: Request): string {
  const preferred = request.headers.get('x-shippie-attachment-content-type') ?? request.headers.get('content-type');
  if (!preferred) return 'application/octet-stream';
  const cleaned = preferred.trim().toLowerCase();
  if (!cleaned || cleaned.length > 160 || /[\r\n]/.test(cleaned)) return 'application/octet-stream';
  return cleaned;
}

function eventPrefix(documentId: string): string {
  return `documents/v0/${documentId}/events/`;
}

function eventKey(event: EncryptedDocumentEventEnvelope): string {
  const created = event.createdAt.replace(/[^0-9A-Za-z_-]/g, '-');
  return `${eventPrefix(event.documentId)}${created}_${event.eventId}.json`;
}

function snapshotPrefix(documentId: string): string {
  return `documents/v0/${documentId}/snapshots/`;
}

function snapshotKey(snapshot: EncryptedDocumentSnapshotEnvelope): string {
  const created = snapshot.createdAt.replace(/[^0-9A-Za-z_-]/g, '-');
  return `${snapshotPrefix(snapshot.documentId)}${created}_${snapshot.snapshotId}.json`;
}

function healthKey(documentId: string): string {
  return `documents:v0:${documentId}:health`;
}

function manifestKey(documentId: string): string {
  return `documents:v0:${documentId}:manifest`;
}

function attachmentKey(documentId: string, attachmentId: string): string {
  return `documents/v0/${documentId}/attachments/${attachmentId}.bin`;
}

function attachmentHealthKey(documentId: string): string {
  return `documents:v0:${documentId}:attachments:health`;
}

function budgetKey(kind: 'document' | 'ip' | 'device' | 'attachment' | 'device-attachment', id: string): string {
  return `documents:v0:budget:${kind}:${id}`;
}

async function updateDocumentManifest(
  env: SealedDocumentEnv,
  documentId: string,
  patch: {
    eventCountDelta?: number;
    snapshotCountDelta?: number;
    attachmentCountDelta?: number;
    latestEventId?: string;
    latestEventCursor?: string;
    latestSnapshotId?: string;
    latestSnapshotCursor?: string;
    lastAttachmentId?: string;
  },
  opts: { current?: SealedDocumentManifest | Promise<SealedDocumentManifest> } = {},
): Promise<void> {
  if (!env.CACHE) return;
  const current = opts.current ? await opts.current : await readSealedDocumentManifest(env, documentId);
  const next: SealedDocumentManifest = {
    ...current,
    eventCount: current.eventCount + Math.max(0, Math.floor(patch.eventCountDelta ?? 0)),
    snapshotCount: current.snapshotCount + Math.max(0, Math.floor(patch.snapshotCountDelta ?? 0)),
    attachmentCount: current.attachmentCount + Math.max(0, Math.floor(patch.attachmentCountDelta ?? 0)),
    latestEventId: patch.latestEventId ?? current.latestEventId,
    latestEventCursor: patch.latestEventCursor ?? current.latestEventCursor,
    latestSnapshotId: patch.latestSnapshotId ?? current.latestSnapshotId,
    latestSnapshotCursor: patch.latestSnapshotCursor ?? current.latestSnapshotCursor,
    lastAttachmentId: patch.lastAttachmentId ?? current.lastAttachmentId,
    updatedAt: new Date().toISOString(),
  };
  await env.CACHE.put(manifestKey(documentId), JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 365 });
}

function emptyManifest(documentId: string): SealedDocumentManifest {
  return {
    schema: 'shippie.document.manifest.v1',
    documentId,
    eventCount: 0,
    snapshotCount: 0,
    attachmentCount: 0,
    latestEventId: null,
    latestEventCursor: null,
    latestSnapshotId: null,
    latestSnapshotCursor: null,
    lastAttachmentId: null,
    updatedAt: null,
  };
}

function normaliseManifest(documentId: string, value: unknown): SealedDocumentManifest {
  if (!value || typeof value !== 'object') return emptyManifest(documentId);
  const manifest = value as Partial<SealedDocumentManifest>;
  return {
    schema: 'shippie.document.manifest.v1',
    documentId,
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

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

interface BudgetCounter {
  events: number;
  bytes: number;
}

async function readBudget(kv: KVNamespace, key: string): Promise<BudgetCounter> {
  const raw = await kv.get(key);
  if (!raw) return { events: 0, bytes: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<BudgetCounter>;
    return {
      events: Number.isFinite(parsed.events) ? Number(parsed.events) : 0,
      bytes: Number.isFinite(parsed.bytes) ? Number(parsed.bytes) : 0,
    };
  } catch {
    return { events: 0, bytes: 0 };
  }
}

async function writeBudget(kv: KVNamespace, key: string, value: BudgetCounter): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: 60 * 60 * 48 });
}

async function maybeRunInBackground(
  waitUntil: BackgroundTaskScheduler | undefined,
  task: Promise<unknown> | undefined,
): Promise<void> {
  if (!task) return;
  if (!waitUntil) {
    await task;
    return;
  }
  waitUntil(task.catch((err) => {
    console.warn('[sealed-cloud] background task failed', err);
  }));
}

function budgetGauge(used: number, limit: number): SealedDocumentBudgetGauge {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeLimit = Math.max(1, Math.floor(limit));
  return {
    used: safeUsed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeUsed),
    ratio: Math.min(1, safeUsed / safeLimit),
  };
}

function budgetStatus(gauges: Array<[string, SealedDocumentBudgetGauge]>): {
  status: SealedDocumentBudgetStatus;
  warnings: string[];
} {
  const warnings: string[] = [];
  let status: SealedDocumentBudgetStatus = 'healthy';
  for (const [label, gauge] of gauges) {
    if (gauge.ratio >= 0.9) {
      status = 'limited';
      warnings.push(`${label} is close to today's safety cap`);
    } else if (gauge.ratio >= 0.7 && status !== 'limited') {
      status = 'watch';
      warnings.push(`${label} is rising quickly today`);
    }
  }
  return { status, warnings };
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clientAddress(request: Request | undefined): string {
  if (!request) return 'unknown';
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

function hashableDeviceId(request: Request | undefined): string {
  const deviceId = request?.headers.get('x-shippie-device-id')?.trim();
  if (deviceId && TOKEN_RE.test(deviceId)) return deviceId;
  return `ip:${clientAddress(request)}`;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let s = '';
  const bytes = new Uint8Array(digest);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function serialisedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
