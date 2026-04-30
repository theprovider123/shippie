/**
 * Glimpses — a photo (data URL) that auto-expires N hours after the
 * recipient first views it. New glimpses arrive sealed; once seen,
 * a `seen_at` timestamp starts the clock.
 *
 * No server cleanup needed: each device prunes expired glimpses on
 * read.
 */
import * as Y from 'yjs';

export const GLIMPSE_EXPIRY_HOURS = 24;

export interface Glimpse {
  id: string;
  author_device: string;
  photo_data_url: string;
  caption: string | null;
  created_at: string;
  seen_at: string | null;
}

function getArr(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('glimpses');
}

function readMap(m: Y.Map<unknown>): Glimpse {
  return {
    id: (m.get('id') as string | undefined) ?? '',
    author_device: (m.get('author_device') as string | undefined) ?? '',
    photo_data_url: (m.get('photo_data_url') as string | undefined) ?? '',
    caption: (m.get('caption') as string | null | undefined) ?? null,
    created_at: (m.get('created_at') as string | undefined) ?? new Date().toISOString(),
    seen_at: (m.get('seen_at') as string | null | undefined) ?? null,
  };
}

export function readGlimpses(doc: Y.Doc): Glimpse[] {
  const arr = getArr(doc);
  return arr.toArray().map(readMap).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addGlimpse(
  doc: Y.Doc,
  authorDevice: string,
  photoDataUrl: string,
  caption: string | null = null,
): Glimpse {
  const id = uuid();
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', id);
    m.set('author_device', authorDevice);
    m.set('photo_data_url', photoDataUrl);
    m.set('caption', caption);
    m.set('created_at', new Date().toISOString());
    m.set('seen_at', null);
    getArr(doc).push([m]);
  });
  return readMap(m);
}

export function markGlimpseSeen(doc: Y.Doc, id: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== id) continue;
    if (!m.get('seen_at')) m.set('seen_at', new Date().toISOString());
    return;
  }
}

export function deleteGlimpse(doc: Y.Doc, id: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i)!.get('id') === id) {
      arr.delete(i, 1);
      return;
    }
  }
}

export function isExpired(g: Glimpse, now = Date.now(), expiryHours = GLIMPSE_EXPIRY_HOURS): boolean {
  if (!g.seen_at) return false;
  const seen = new Date(g.seen_at).getTime();
  return now - seen > expiryHours * 3_600_000;
}

export function pruneExpired(doc: Y.Doc, now = Date.now(), expiryHours = GLIMPSE_EXPIRY_HOURS): number {
  const arr = getArr(doc);
  let pruned = 0;
  doc.transact(() => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const g = readMap(arr.get(i)!);
      if (isExpired(g, now, expiryHours)) {
        arr.delete(i, 1);
        pruned += 1;
      }
    }
  });
  return pruned;
}

export function timeLeftMs(g: Glimpse, expiryHours = GLIMPSE_EXPIRY_HOURS): number | null {
  if (!g.seen_at) return null;
  const seen = new Date(g.seen_at).getTime();
  return Math.max(0, seen + expiryHours * 3_600_000 - Date.now());
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
