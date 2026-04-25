import {
  UnsupportedError,
  detectLocalRuntimeCapabilities,
  type LocalDbBackupInfo,
  type LocalDbExportOptions,
  type LocalDbQueryOptions,
  type LocalDbRecord,
  type LocalDbSchema,
  type ShippieLocalAi,
  type ShippieLocalDb,
  type ShippieLocalFiles,
  type ShippieLocalRuntime,
} from '@shippie/local-runtime-contract';
import { createLocalFiles } from '@shippie/local-files';
import { createWorkerLocalDb } from './worker-db.ts';
import { recordCapabilityProof } from './telemetry.ts';

export interface AttachedShippieGlobal {
  version?: string;
  local?: ShippieRuntime;
}

export interface ShippieRuntime extends ShippieLocalRuntime {
  version: string;
  capabilities: typeof detectLocalRuntimeCapabilities;
  db: ShippieLocalDb;
  files: ShippieLocalFiles;
  ai: ShippieLocalAi;
}

export interface CreateLocalRuntimeOptions {
  version?: string;
  db?: ShippieLocalDb;
  dbFactory?: () => Promise<ShippieLocalDb>;
  files?: ShippieLocalFiles | (() => Promise<ShippieLocalFiles>);
  ai?: ShippieLocalAi;
  aiFactory?: () => Promise<ShippieLocalAi>;
  appId?: string;
  sqliteWasmUrl?: string;
  dbWorkerUrl?: string;
}

export interface AttachLocalRuntimeOptions extends CreateLocalRuntimeOptions {
  root?: typeof globalThis;
}

export const LOCAL_RUNTIME_VERSION = '0.1.0';

export {
  recordCapabilityProof,
  resetCapabilityProofMemoryForTests,
  type CapabilityProofName,
  type CapabilityProofOptions,
} from './telemetry.ts';

export function createLocalRuntime(opts: CreateLocalRuntimeOptions = {}): ShippieRuntime {
  return {
    version: opts.version ?? LOCAL_RUNTIME_VERSION,
    capabilities: detectLocalRuntimeCapabilities,
    db: opts.db ?? lazyDb(opts.dbFactory ?? (() => createDefaultDb(opts))),
    files: lazyFiles(opts.files ?? createLocalFiles),
    ai: opts.ai ?? (opts.aiFactory ? lazyAi(opts.aiFactory) : unsupportedAi()),
  };
}

export function attachLocalRuntime(opts: AttachLocalRuntimeOptions = {}): ShippieRuntime {
  const root = opts.root ?? globalThis;
  const runtime = createLocalRuntime(opts);
  const existing = ((root as unknown as { shippie?: AttachedShippieGlobal }).shippie ?? {}) as AttachedShippieGlobal;
  existing.local = runtime;
  (root as unknown as { shippie: AttachedShippieGlobal }).shippie = existing;
  if ('window' in root && root.window) {
    (root.window as unknown as { shippie: AttachedShippieGlobal }).shippie = existing;
  }
  void probeOpfs();
  return runtime;
}

async function probeOpfs(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const probe = await root.getFileHandle('__shippie_probe', { create: true });
    const writable = await probe.createWritable();
    await writable.write('1');
    await writable.close();
    await root.removeEntry('__shippie_probe');
    recordCapabilityProof('local.opfs_probe', { metadata: { ok: true } });
  } catch {
    /* no-op — probe failure is also a useful signal but we only emit positive proofs */
  }
}

function lazyFiles(source: ShippieLocalFiles | (() => Promise<ShippieLocalFiles>)): ShippieLocalFiles {
  let promise: Promise<ShippieLocalFiles> | null = null;
  const get = async () => {
    if (typeof source !== 'function') return source;
    promise ??= source();
    return promise;
  };
  const proven = () => recordCapabilityProof('local.files_used');
  return {
    write: async (path, value) => {
      const r = await (await get()).write(path, value);
      proven();
      return r;
    },
    read: async (path) => (await get()).read(path),
    list: async (path) => (await get()).list(path),
    delete: async (path) => (await get()).delete(path),
    usage: async () => (await get()).usage(),
    thumbnail: async (path, opts) => (await get()).thumbnail(path, opts),
  };
}

function lazyDb(source: ShippieLocalDb | (() => Promise<ShippieLocalDb>)): ShippieLocalDb {
  let promise: Promise<ShippieLocalDb> | null = null;
  const get = async () => {
    if (typeof source !== 'function') return source;
    promise ??= source();
    return promise;
  };
  const proven = () => recordCapabilityProof('local.db_used');
  return {
    create: async (table, schema) => {
      const r = await (await get()).create(table, schema);
      proven();
      return r;
    },
    insert: async (table, value) => {
      const r = await (await get()).insert(table, value);
      proven();
      return r;
    },
    query: async (table, opts) => (await get()).query(table, opts),
    search: async (table, query, opts) => (await get()).search(table, query, opts),
    vectorSearch: async (table, vector, opts) => (await get()).vectorSearch(table, vector, opts),
    update: async (table, id, patch) => (await get()).update(table, id, patch),
    delete: async (table, id) => (await get()).delete(table, id),
    count: async (table, opts) => (await get()).count(table, opts),
    export: async (table, opts) => (await get()).export(table, opts),
    restore: async (backup, opts) => (await get()).restore(backup, opts),
    lastBackup: async () => (await get()).lastBackup(),
    usage: async () => (await get()).usage(),
    requestPersistence: async () => {
      const granted = await (await get()).requestPersistence();
      recordCapabilityProof(granted ? 'local.persist_granted' : 'local.persist_denied');
      return granted;
    },
  };
}

async function createDefaultDb(opts: CreateLocalRuntimeOptions): Promise<ShippieLocalDb> {
  const caps = detectLocalRuntimeCapabilities();
  if (!caps.opfs || !caps.webWorker) {
    throw new UnsupportedError('Persistent shippie.local.db requires OPFS and Worker support in this runtime build');
  }
  return createWorkerLocalDb({
    workerUrl: opts.dbWorkerUrl ?? '/__shippie/local/worker.latest.js',
    wasmUrl: opts.sqliteWasmUrl ?? '/__shippie/local/wa-sqlite-async.wasm',
    appId: opts.appId ?? resolveAppId(),
  });
}

function unsupportedDb(): ShippieLocalDb {
  return {
    create: unsupported('db.create'),
    insert: unsupported('db.insert'),
    query: unsupported('db.query'),
    search: unsupported('db.search'),
    vectorSearch: unsupported('db.vectorSearch'),
    update: unsupported('db.update'),
    delete: unsupported('db.delete'),
    count: unsupported('db.count'),
    export: unsupported('db.export'),
    restore: unsupported('db.restore'),
    lastBackup: async () => null,
    usage: async () => ({ usedBytes: 0, warningLevel: 'none' }),
    requestPersistence: async () => false,
  };
}

function resolveAppId(): string {
  if (typeof location !== 'undefined' && location.hostname) return location.hostname;
  return 'local-app';
}

function lazyAi(factory: () => Promise<ShippieLocalAi>): ShippieLocalAi {
  let promise: Promise<ShippieLocalAi> | null = null;
  const get = async () => {
    promise ??= factory();
    return promise;
  };
  const proven = () => recordCapabilityProof('local.ai_model_cached');
  return {
    available: async () => (await get()).available(),
    classify: async (text, opts) => {
      const result = await (await get()).classify(text, opts);
      proven();
      return result;
    },
    sentiment: async (text) => {
      const result = await (await get()).sentiment(text);
      proven();
      return result;
    },
    embed: async (text) => {
      const result = await (await get()).embed(text);
      proven();
      return result;
    },
    labelImage: async (image) => (await get()).labelImage(image),
  };
}

function unsupportedAi(): ShippieLocalAi {
  return {
    available: async () => {
      const caps = detectLocalRuntimeCapabilities();
      return {
        embeddings: false,
        classification: false,
        sentiment: false,
        vision: false,
        gpu: caps.webGpu,
        wasm: caps.wasm,
      };
    },
    classify: unsupported('ai.classify'),
    sentiment: unsupported('ai.sentiment'),
    embed: unsupported('ai.embed'),
    labelImage: unsupported('ai.labelImage'),
  };
}

function unsupported<TArgs extends unknown[], TResult>(feature: string): (...args: TArgs) => Promise<TResult> {
  return async () => {
    throw new UnsupportedError(`${feature} is not available in this local runtime build`);
  };
}

// Type anchors keep unsupportedDb assignable without widening every method.
void (null as unknown as LocalDbBackupInfo | LocalDbExportOptions | LocalDbQueryOptions | LocalDbRecord | LocalDbSchema);
