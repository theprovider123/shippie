/**
 * AI-pending analysis queue for the ambient package.
 *
 * When an analyser is not `syncable` (it needs the AI bridge) and no tab
 * is open to host the bridge, the orchestrator enqueues a request here.
 * The wrapper drains this queue when the document side wakes up and an
 * AI bridge is reachable.
 *
 * Shares the same `shippie-ambient` IndexedDB as `insight-store.ts`.
 */
import {
  QUEUE_STORE,
  _openAmbientDb,
  _resetInsightStoreForTest,
} from './insight-store.ts';

export interface QueuedAnalysis {
  analyserId: string;
  collection: string;
  cursorTs: number;
  enqueuedAt: number;
}

export async function enqueueAnalysis(req: {
  analyserId: string;
  collection: string;
  cursorTs: number;
  enqueuedAt?: number;
}): Promise<void> {
  const record: QueuedAnalysis = {
    analyserId: req.analyserId,
    collection: req.collection,
    cursorTs: req.cursorTs,
    enqueuedAt: req.enqueuedAt ?? Date.now(),
  };
  const db = await _openAmbientDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const req2 = tx.objectStore(QUEUE_STORE).add(record);
    req2.onsuccess = () => resolve();
    req2.onerror = () => reject(req2.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function drainQueue(): Promise<QueuedAnalysis[]> {
  const db = await _openAmbientDb();
  const items = await new Promise<QueuedAnalysis[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedAnalysis[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const req = tx.objectStore(QUEUE_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
  return items;
}

export async function _resetQueueForTest(): Promise<void> {
  // Queue + insight store share one DB connection — resetting either
  // closes the connection and deletes the database, so this is a single
  // operation under the hood.
  await _resetInsightStoreForTest();
}
