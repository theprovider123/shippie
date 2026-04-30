/**
 * Fantasy box — each writes sealed wishes. To open one,
 * BOTH phones must tap "open" within a 30-second window.
 * The matched tap pulls a random unread wish authored by the partner.
 *
 * Y.Map shape:
 *   wishes:  Array<{ id, author, text, createdAt, openedAt? }>
 *   tap:     { byDevice: Record<deviceId, ts>, opened?: { wishId, at } }
 */
import * as Y from 'yjs';

export const TAP_WINDOW_MS = 30_000;

export interface Wish {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  openedAt?: string;
}

export interface FantasyState {
  wishes: Wish[];
  tap: {
    byDevice: Record<string, number>;
    opened?: { wishId: string; at: string };
  };
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('fantasy');
}

export function readFantasy(doc: Y.Doc): FantasyState {
  const m = getMap(doc);
  const tap = (m.get('tap') as
    | { byDevice: Record<string, number>; opened?: { wishId: string; at: string } }
    | undefined) ?? { byDevice: {} };
  return {
    wishes: ((m.get('wishes') as Wish[] | undefined) ?? []).slice(),
    tap: {
      byDevice: { ...tap.byDevice },
      ...(tap.opened ? { opened: { ...tap.opened } } : {}),
    },
  };
}

export function addWish(doc: Y.Doc, author: string, text: string): void {
  if (!text.trim()) return;
  const m = getMap(doc);
  const existing = ((m.get('wishes') as Wish[] | undefined) ?? []);
  const wish: Wish = {
    id: crypto.randomUUID(),
    author,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  m.set('wishes', [...existing, wish]);
}

export function deleteWish(doc: Y.Doc, deviceId: string, wishId: string): void {
  const m = getMap(doc);
  const existing = ((m.get('wishes') as Wish[] | undefined) ?? []);
  // Only the author can delete their own.
  m.set(
    'wishes',
    existing.filter((w) => !(w.id === wishId && w.author === deviceId)),
  );
}

/**
 * Register a tap. If the partner has tapped within TAP_WINDOW_MS,
 * pull a random unread wish authored by them and mark it opened.
 */
export function tapToOpen(doc: Y.Doc, deviceId: string, partnerId: string | null): Wish | null {
  if (!partnerId) return null;
  const m = getMap(doc);
  const tapState = (m.get('tap') as
    | { byDevice: Record<string, number>; opened?: { wishId: string; at: string } }
    | undefined) ?? { byDevice: {} };
  const now = Date.now();
  const partnerTs = tapState.byDevice[partnerId];
  const myTs = now;

  const nextByDevice = { ...tapState.byDevice, [deviceId]: myTs };

  // Both tapped within window?
  if (partnerTs !== undefined && now - partnerTs < TAP_WINDOW_MS) {
    const wishes = ((m.get('wishes') as Wish[] | undefined) ?? []);
    const candidates = wishes.filter((w) => w.author === partnerId && !w.openedAt);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      const updated = wishes.map((w) =>
        w.id === pick.id ? { ...w, openedAt: new Date().toISOString() } : w,
      );
      m.set('wishes', updated);
      // Reset tap state so next pair-open requires fresh taps.
      m.set('tap', {
        byDevice: {},
        opened: { wishId: pick.id, at: new Date().toISOString() },
      });
      return { ...pick, openedAt: new Date().toISOString() };
    }
    // Tapped together but nothing to open — clear and signal nothing opened.
    m.set('tap', { byDevice: {} });
    return null;
  }

  // Just record the lonely tap.
  m.set('tap', { byDevice: nextByDevice });
  return null;
}

export function clearOpened(doc: Y.Doc): void {
  const m = getMap(doc);
  const t = (m.get('tap') as
    | { byDevice: Record<string, number>; opened?: unknown }
    | undefined) ?? { byDevice: {} };
  m.set('tap', { byDevice: t.byDevice });
}

export function pendingTapFrom(state: FantasyState, partnerId: string | null, now: number): boolean {
  if (!partnerId) return false;
  const ts = state.tap.byDevice[partnerId];
  return ts !== undefined && now - ts < TAP_WINDOW_MS;
}
