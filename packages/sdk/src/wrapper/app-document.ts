import {
  createIndexedDbDocumentStore,
  createLocalStorageDocumentStore,
  createSealedSyncClient,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  type DeviceSigningKeyPair,
  type DocumentEvent,
  type DocumentHandle,
  type RealtimeSyncOptions,
} from '@shippie/doc';

export interface OpenAppDocumentOptions<State, Payload> {
  appSlug: string;
  documentName?: string;
  documentId?: string;
  namespace?: string;
  initialState: State;
  reducer: (state: State, event: DocumentEvent<Payload>) => State;
  sync?: boolean;
  realtime?: false | Partial<RealtimeSyncOptions>;
}

export async function openAppDocument<State, Payload>(
  opts: OpenAppDocumentOptions<State, Payload>,
): Promise<DocumentHandle<State, Payload>> {
  if (!hasBrowserCrypto()) {
    throw new Error('Shippie Documents need browser storage and WebCrypto.');
  }

  const appSlug = safePart(opts.appSlug);
  const documentName = safePart(opts.documentName ?? 'main');
  const namespace = opts.namespace ?? `shippie.${appSlug}.documents.v1`;
  const documentId = opts.documentId ?? readOrCreate(`${namespace}:${documentName}:document-id`, () =>
    `doc_${appSlug}_${documentName}_${randomBase64Url(18)}`,
  );
  const documentKey = readOrCreate(`${namespace}:${documentName}:document-key`, generateDocumentKey);
  const signing = await signingFor(`${namespace}:device-signing`);
  const sync = opts.sync === true ? createSealedSyncClient() : undefined;

  return openDocument<State, Payload>({
    documentId,
    documentKey,
    signing,
    store: createBrowserDocumentStore(namespace),
    sync,
    realtime: sync ? inheritedRealtime(opts.realtime) : false,
    initialState: opts.initialState,
    reducer: opts.reducer,
  });
}

function inheritedRealtime(overrides: OpenAppDocumentOptions<unknown, unknown>['realtime']): RealtimeSyncOptions | false {
  if (overrides === false) return false;
  return {
    pushDebounceMs: overrides?.pushDebounceMs ?? 80,
    pullIntervalMs: overrides?.pullIntervalMs ?? 1_000,
    idlePullIntervalMs: overrides?.idlePullIntervalMs ?? 15_000,
    maxBackoffMs: overrides?.maxBackoffMs ?? 30_000,
  };
}

function createBrowserDocumentStore(namespace: string) {
  try {
    if (typeof indexedDB !== 'undefined') return createIndexedDbDocumentStore({ namespace });
  } catch {
    // Fall through to localStorage for older/private browser contexts.
  }
  return createLocalStorageDocumentStore({ namespace });
}

async function signingFor(storageKey: string): Promise<DeviceSigningKeyPair> {
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    try {
      const saved = JSON.parse(existing) as {
        publicJwk: JsonWebKey;
        privateJwk: JsonWebKey;
        publicKeySpki: string;
        deviceId: string;
      };
      const publicKey = await crypto.subtle.importKey('jwk', saved.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
      const privateKey = await crypto.subtle.importKey('jwk', saved.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
      return { deviceId: saved.deviceId, publicKey, privateKey, publicKeySpki: saved.publicKeySpki };
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  const generated = await generateDeviceSigningKeyPair();
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', generated.publicKey),
    crypto.subtle.exportKey('jwk', generated.privateKey),
  ]);
  localStorage.setItem(storageKey, JSON.stringify({
    deviceId: generated.deviceId,
    publicKeySpki: generated.publicKeySpki,
    publicJwk,
    privateJwk,
  }));
  return generated;
}

function readOrCreate(storageKey: string, create: () => string): string {
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const next = create();
  localStorage.setItem(storageKey, next);
  return next;
}

function hasBrowserCrypto(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

function safePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'main';
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
