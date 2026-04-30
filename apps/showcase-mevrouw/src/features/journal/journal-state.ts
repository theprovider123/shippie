/**
 * Journal = a thread of entries (one author each), with replies.
 * Each entry is a Y.Map so author/content/mood can edit independently
 * (rare but cheap).
 */
import * as Y from 'yjs';

export interface JournalEntry {
  id: string;
  author_device: string;
  content: string;
  mood: string | null;
  reply_to: string | null;
  memory_date: string; // YYYY-MM-DD
  created_at: string; // ISO
}

function getEntriesArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('journal_entries');
}

export function readEntries(doc: Y.Doc): JournalEntry[] {
  return getEntriesArray(doc)
    .toArray()
    .map((m) => readEntryMap(m))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function readEntryMap(map: Y.Map<unknown>): JournalEntry {
  return {
    id: (map.get('id') as string | undefined) ?? '',
    author_device: (map.get('author_device') as string | undefined) ?? '',
    content: (map.get('content') as string | undefined) ?? '',
    mood: (map.get('mood') as string | null | undefined) ?? null,
    reply_to: (map.get('reply_to') as string | null | undefined) ?? null,
    memory_date: (map.get('memory_date') as string | undefined) ?? '',
    created_at: (map.get('created_at') as string | undefined) ?? new Date().toISOString(),
  };
}

export function addEntry(
  doc: Y.Doc,
  authorDevice: string,
  fields: { content: string; mood?: string | null; reply_to?: string | null; memory_date?: string },
): JournalEntry {
  const id = uuid();
  const now = new Date();
  const memory_date = fields.memory_date ?? now.toISOString().slice(0, 10);
  const map = new Y.Map<unknown>();
  doc.transact(() => {
    map.set('id', id);
    map.set('author_device', authorDevice);
    map.set('content', fields.content);
    map.set('mood', fields.mood ?? null);
    map.set('reply_to', fields.reply_to ?? null);
    map.set('memory_date', memory_date);
    map.set('created_at', now.toISOString());
    getEntriesArray(doc).push([map]);
  });
  return readEntryMap(map);
}

export function deleteEntry(doc: Y.Doc, id: string): boolean {
  const arr = getEntriesArray(doc);
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i)!.get('id') === id) {
      arr.delete(i, 1);
      return true;
    }
  }
  return false;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
