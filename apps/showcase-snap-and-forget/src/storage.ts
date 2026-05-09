/**
 * Snap storage. Each snap is a Blob + thumb + searchable label list.
 * IndexedDB so the bytes survive a tab close. Keyed by capture
 * timestamp so multiple snaps per day are fine — this app is for
 * "snap anything to remember", not one-per-day rationing.
 */

export interface Snap {
  id: string;          // ISO timestamp + random suffix
  blob: Blob;
  thumbDataUrl: string;
  labels: string[];
  capturedAt: string;  // ISO 8601
  geoCoarse?: 'city' | 'region' | 'country';  // future: hook a coarse-geo source
}

const DB_NAME = 'shippie-snap-and-forget';
const DB_VERSION = 1;
const STORE = 'snaps';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSnap(snap: Snap): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snap);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateLabels(id: string, labels: string[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const existing = req.result as Snap | undefined;
      if (!existing) return resolve();
      store.put({ ...existing, labels });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSnap(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSnaps(): Promise<Snap[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as Snap[]).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function blobToThumb(blob: Blob, size = 320): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const ratio = Math.min(size / bitmap.width, size / bitmap.height);
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.7);
}
