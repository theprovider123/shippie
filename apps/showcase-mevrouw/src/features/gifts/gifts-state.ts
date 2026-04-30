/**
 * Gift letters as a Yjs-backed list.
 *
 * Each gift letter is a Y.Map so individual fields can be edited
 * concurrently from two devices and merge field-by-field. This
 * matches the Postgres `mevrouw.gift_letters` shape from
 * supabase/migrations/003_schema_v2.sql but with one critical
 * difference: there is no `couple_id` column. The whole document is
 * already couple-scoped — there's no global table to filter on.
 *
 * Field map:
 *   id           string  — uuid v4 generated client-side
 *   author       'me' | 'them' — relative to whoever's reading
 *   recipient    'me' | 'them'
 *   headline     string
 *   body         string
 *   unlockAt     ISO 8601 string — gift sealed until this moment
 *   openedAt     ISO 8601 string | null — when the recipient opened it
 *   createdAt    ISO 8601 string
 *
 * The author field is "relative" — when YOU look at a gift letter
 * the author is "me" or "them" depending on whose deviceId wrote it.
 * Stored canonically as the writer's deviceId; the UI resolves it.
 */
import * as Y from 'yjs';

export interface GiftLetterFields {
  id: string;
  authorDevice: string;
  recipientDevice: string | null;
  headline: string;
  body: string;
  unlockAt: string;
  openedAt: string | null;
  createdAt: string;
}

export type GiftLetterMap = Y.Map<unknown>;

export function getGiftsArray(doc: Y.Doc): Y.Array<GiftLetterMap> {
  return doc.getArray<GiftLetterMap>('gifts');
}

export function readGifts(doc: Y.Doc): GiftLetterFields[] {
  return getGiftsArray(doc)
    .toArray()
    .map((m) => readGiftMap(m))
    .sort((a, b) => a.unlockAt.localeCompare(b.unlockAt));
}

export function readGiftMap(map: GiftLetterMap): GiftLetterFields {
  return {
    id: (map.get('id') as string | undefined) ?? '',
    authorDevice: (map.get('authorDevice') as string | undefined) ?? '',
    recipientDevice: (map.get('recipientDevice') as string | null | undefined) ?? null,
    headline: (map.get('headline') as string | undefined) ?? '',
    body: (map.get('body') as string | undefined) ?? '',
    unlockAt: (map.get('unlockAt') as string | undefined) ?? new Date().toISOString(),
    openedAt: (map.get('openedAt') as string | null | undefined) ?? null,
    createdAt: (map.get('createdAt') as string | undefined) ?? new Date().toISOString(),
  };
}

export function addGift(
  doc: Y.Doc,
  authorDevice: string,
  fields: Omit<GiftLetterFields, 'id' | 'authorDevice' | 'createdAt' | 'openedAt'>,
): GiftLetterFields {
  const id = generateGiftId();
  const map = new Y.Map<unknown>();
  doc.transact(() => {
    map.set('id', id);
    map.set('authorDevice', authorDevice);
    map.set('recipientDevice', fields.recipientDevice ?? null);
    map.set('headline', fields.headline);
    map.set('body', fields.body);
    map.set('unlockAt', fields.unlockAt);
    map.set('openedAt', null);
    map.set('createdAt', new Date().toISOString());
    getGiftsArray(doc).push([map]);
  });
  return readGiftMap(map);
}

export function openGift(doc: Y.Doc, id: string, openedAt = new Date().toISOString()): boolean {
  const arr = getGiftsArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const map = arr.get(i)!;
    if (map.get('id') === id) {
      if (map.get('openedAt')) return false;
      map.set('openedAt', openedAt);
      return true;
    }
  }
  return false;
}

export function deleteGift(doc: Y.Doc, id: string): boolean {
  const arr = getGiftsArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const map = arr.get(i)!;
    if (map.get('id') === id) {
      arr.delete(i, 1);
      return true;
    }
  }
  return false;
}

export function isUnlocked(gift: GiftLetterFields, now = Date.now()): boolean {
  return new Date(gift.unlockAt).getTime() <= now;
}

function generateGiftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
