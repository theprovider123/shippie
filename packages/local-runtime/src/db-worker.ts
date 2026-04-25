import { createSqliteLocalDb, createWaSqliteEngine } from '@shippie/local-db';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

interface WorkerRequest {
  id: number;
  method: keyof ShippieLocalDb;
  args?: unknown[];
  init?: {
    appId?: string;
    wasmUrl?: string;
  };
}

let dbPromise: Promise<ShippieLocalDb> | null = null;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const db = await getDb(request.init);
    const method = db[request.method] as (...args: unknown[]) => Promise<unknown>;
    const result = await method.apply(db, request.args ?? []);
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

async function getDb(init: WorkerRequest['init']): Promise<ShippieLocalDb> {
  dbPromise ??= create();
  return dbPromise;

  async function create() {
    const engine = await createWaSqliteEngine({
      filename: '/shippie-local.db',
      opfs: true,
      wasmUrl: init?.wasmUrl ?? '/__shippie/local/wa-sqlite-async.wasm',
    });
    return createSqliteLocalDb(engine, {
      appId: init?.appId ?? 'local-app',
      schemaVersion: 1,
    });
  }
}
