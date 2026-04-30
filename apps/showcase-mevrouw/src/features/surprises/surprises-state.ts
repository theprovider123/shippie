/**
 * Surprises = sealed messages from one partner to the other,
 * unlocked at a time OR at the next visit. Body can be text, audio
 * (data URL), or an image (data URL). All data stays on-device.
 */
import * as Y from 'yjs';

export type UnlockMode = 'at_time' | 'at_next_visit';
export type SurpriseKind = 'text' | 'audio' | 'image';

export interface Surprise {
  id: string;
  author_device: string;
  recipient_device: string | null;
  kind: SurpriseKind;
  body: string;
  unlock_mode: UnlockMode;
  deliver_at: string | null;
  read_at: string | null;
  created_at: string;
}

function getArr(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('surprises');
}

export function readSurprises(doc: Y.Doc): Surprise[] {
  return getArr(doc)
    .toArray()
    .map((m) => readMap(m))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function readMap(m: Y.Map<unknown>): Surprise {
  return {
    id: (m.get('id') as string | undefined) ?? '',
    author_device: (m.get('author_device') as string | undefined) ?? '',
    recipient_device: (m.get('recipient_device') as string | null | undefined) ?? null,
    kind: ((m.get('kind') as SurpriseKind | undefined) ?? 'text'),
    body: (m.get('body') as string | undefined) ?? '',
    unlock_mode: ((m.get('unlock_mode') as UnlockMode | undefined) ?? 'at_time'),
    deliver_at: (m.get('deliver_at') as string | null | undefined) ?? null,
    read_at: (m.get('read_at') as string | null | undefined) ?? null,
    created_at: (m.get('created_at') as string | undefined) ?? new Date().toISOString(),
  };
}

export function addSurprise(
  doc: Y.Doc,
  authorDevice: string,
  fields: Omit<Surprise, 'id' | 'author_device' | 'created_at' | 'read_at'>,
): Surprise {
  const id = uuid();
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', id);
    m.set('author_device', authorDevice);
    m.set('recipient_device', fields.recipient_device);
    m.set('kind', fields.kind);
    m.set('body', fields.body);
    m.set('unlock_mode', fields.unlock_mode);
    m.set('deliver_at', fields.deliver_at);
    m.set('read_at', null);
    m.set('created_at', new Date().toISOString());
    getArr(doc).push([m]);
  });
  return readMap(m);
}

export function markSurpriseRead(doc: Y.Doc, id: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== id) continue;
    if (!m.get('read_at')) m.set('read_at', new Date().toISOString());
    return;
  }
}

export function deleteSurprise(doc: Y.Doc, id: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i)!.get('id') === id) {
      arr.delete(i, 1);
      return;
    }
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
