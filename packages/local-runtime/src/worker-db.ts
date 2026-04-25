import type {
  LocalDbBackupInfo,
  LocalDbExportOptions,
  LocalDbQueryOptions,
  LocalDbRecord,
  LocalDbSchema,
  LocalDbUsage,
  ShippieLocalDb,
} from '@shippie/local-runtime-contract';

interface WorkerDbOptions {
  workerUrl?: string;
  wasmUrl?: string;
  appId?: string;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export function createWorkerLocalDb(opts: WorkerDbOptions = {}): ShippieLocalDb {
  if (typeof Worker === 'undefined') throw new Error('shippie.local.db requires Worker support');
  const worker = new Worker(opts.workerUrl ?? '/__shippie/local/worker.latest.js');
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const waiter = pending.get(reply.id);
    if (!waiter) return;
    pending.delete(reply.id);
    if (reply.ok) waiter.resolve(reply.result);
    else waiter.reject(new Error(reply.error ?? 'local DB worker call failed'));
  };

  const call = (method: string, args: unknown[] = []) => {
    const id = nextId++;
    const promise = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }));
    worker.postMessage({
      id,
      method,
      args,
      init: {
        appId: opts.appId,
        wasmUrl: opts.wasmUrl ?? '/__shippie/local/wa-sqlite-async.wasm',
      },
    });
    return promise;
  };

  return {
    create: (table: string, schema: LocalDbSchema) => call('create', [table, schema]) as Promise<void>,
    insert: <T extends LocalDbRecord>(table: string, value: T) => call('insert', [table, value]) as Promise<void>,
    query: <T extends LocalDbRecord = LocalDbRecord>(table: string, opts?: LocalDbQueryOptions) =>
      call('query', [table, opts]) as Promise<T[]>,
    search: <T extends LocalDbRecord = LocalDbRecord>(table: string, query: string, opts?: LocalDbQueryOptions) =>
      call('search', [table, query, opts]) as Promise<T[]>,
    vectorSearch: <T extends LocalDbRecord = LocalDbRecord>(table: string, vector: Float32Array, opts?: { limit?: number; column?: string }) =>
      call('vectorSearch', [table, vector, opts]) as Promise<Array<T & { score: number }>>,
    update: <T extends LocalDbRecord>(table: string, id: string, patch: Partial<T>) => call('update', [table, id, patch]) as Promise<void>,
    delete: (table: string, id: string) => call('delete', [table, id]) as Promise<void>,
    count: (table: string, opts?: Pick<LocalDbQueryOptions, 'where'>) => call('count', [table, opts]) as Promise<number>,
    export: (table: string, opts?: LocalDbExportOptions) => call('export', [table, opts]) as Promise<Blob>,
    restore: (backup: Blob, opts?: { passphrase?: string; dryRun?: boolean }) =>
      call('restore', [backup, opts]) as Promise<LocalDbBackupInfo>,
    lastBackup: () => call('lastBackup') as Promise<LocalDbBackupInfo | null>,
    usage: () => call('usage') as Promise<LocalDbUsage>,
    requestPersistence: () => call('requestPersistence') as Promise<boolean>,
  };
}
