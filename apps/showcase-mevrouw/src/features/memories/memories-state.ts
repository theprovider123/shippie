/**
 * Memories = the shared timeline. Photos (data URL until OPFS lands)
 * and short captions, dated by `memory_date`. Includes an
 * `is_favourite` flag for the on-this-day surface.
 */
import * as Y from 'yjs';

export interface Memory {
  id: string;
  author_device: string;
  content: string | null;
  photo_data_url: string | null; // dev-stage; OPFS in prod
  memory_date: string; // YYYY-MM-DD
  is_favourite: boolean;
  created_at: string;
}

function getArr(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('memories');
}

export function readMemories(doc: Y.Doc): Memory[] {
  return getArr(doc)
    .toArray()
    .map((m) => readMap(m))
    .sort((a, b) => b.memory_date.localeCompare(a.memory_date));
}

function readMap(m: Y.Map<unknown>): Memory {
  return {
    id: (m.get('id') as string | undefined) ?? '',
    author_device: (m.get('author_device') as string | undefined) ?? '',
    content: (m.get('content') as string | null | undefined) ?? null,
    photo_data_url: (m.get('photo_data_url') as string | null | undefined) ?? null,
    memory_date: (m.get('memory_date') as string | undefined) ?? '',
    is_favourite: !!m.get('is_favourite'),
    created_at: (m.get('created_at') as string | undefined) ?? new Date().toISOString(),
  };
}

export function addMemory(
  doc: Y.Doc,
  authorDevice: string,
  fields: { content?: string | null; photo_data_url?: string | null; memory_date?: string; is_favourite?: boolean },
): Memory {
  const id = uuid();
  const memory_date = fields.memory_date ?? new Date().toISOString().slice(0, 10);
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', id);
    m.set('author_device', authorDevice);
    m.set('content', fields.content ?? null);
    m.set('photo_data_url', fields.photo_data_url ?? null);
    m.set('memory_date', memory_date);
    m.set('is_favourite', fields.is_favourite ?? false);
    m.set('created_at', new Date().toISOString());
    getArr(doc).push([m]);
  });
  return readMap(m);
}

export function toggleFavourite(doc: Y.Doc, id: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== id) continue;
    m.set('is_favourite', !m.get('is_favourite'));
    return;
  }
}

export function onThisDay(memories: Memory[], today = new Date()): Memory[] {
  const todayMd = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return memories.filter((m) => m.memory_date.slice(5) === todayMd);
}

function pad(v: number): string {
  return String(v).padStart(2, '0');
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
