/**
 * Pulses = ambient "thinking-of-you" pings. Each pulse is a tiny
 * Y.Map: just author + timestamp + maybe an emoji. Recipient sees
 * an unread halo.
 */
import * as Y from 'yjs';

export interface Pulse {
  id: string;
  author_device: string;
  emoji: string | null;
  created_at: string;
  seen_at: string | null;
}

function getArr(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('pulses');
}

export function readPulses(doc: Y.Doc): Pulse[] {
  return getArr(doc)
    .toArray()
    .map(readMap)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function readMap(m: Y.Map<unknown>): Pulse {
  return {
    id: (m.get('id') as string | undefined) ?? '',
    author_device: (m.get('author_device') as string | undefined) ?? '',
    emoji: (m.get('emoji') as string | null | undefined) ?? null,
    created_at: (m.get('created_at') as string | undefined) ?? new Date().toISOString(),
    seen_at: (m.get('seen_at') as string | null | undefined) ?? null,
  };
}

export function sendPulse(doc: Y.Doc, authorDevice: string, emoji: string | null = null): Pulse {
  const id = uuid();
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', id);
    m.set('author_device', authorDevice);
    m.set('emoji', emoji);
    m.set('created_at', new Date().toISOString());
    m.set('seen_at', null);
    getArr(doc).push([m]);
  });
  return readMap(m);
}

export function markPulsesSeen(doc: Y.Doc, recipientDevice: string): void {
  const arr = getArr(doc);
  const now = new Date().toISOString();
  doc.transact(() => {
    arr.forEach((m) => {
      if (m.get('author_device') !== recipientDevice && !m.get('seen_at')) {
        m.set('seen_at', now);
      }
    });
  });
}

export function unseenFromPartner(pulses: Pulse[], myDeviceId: string): Pulse[] {
  return pulses.filter((p) => p.author_device !== myDeviceId && !p.seen_at);
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
