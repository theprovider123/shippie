/**
 * IndexedDB-backed photo storage. One record per day. Stored as a Blob
 * so we never blow up localStorage. The labels arrive asynchronously
 * after capture — `updateLabels` patches the existing record.
 */

export interface DayRecord {
  date: string;        // YYYY-MM-DD
  blob: Blob;
  thumbDataUrl: string;
  labels: string[];
  capturedAt: string;  // ISO
}

const DB_NAME = 'shippie-photo-a-day';
const DB_VERSION = 1;
const STORE = 'days';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'date' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDay(record: DayRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateLabels(date: string, labels: string[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(date);
    req.onsuccess = () => {
      const existing = req.result as DayRecord | undefined;
      if (!existing) return resolve();
      store.put({ ...existing, labels });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listDays(): Promise<DayRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as DayRecord[]).sort((a, b) => b.date.localeCompare(a.date));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function blobToThumb(blob: Blob, size = 256): Promise<string> {
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
