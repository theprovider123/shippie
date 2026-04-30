/**
 * Heartbeat presence — when both phones are open at the same time.
 *
 * Each device writes its current ts to a Y.Map every 5s. If both
 * devices have a timestamp within the last 15s, they're "together".
 *
 * Y.Map shape:
 *   <device_id> → number (ms since epoch)
 */
import * as Y from 'yjs';

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const ONLINE_WINDOW_MS = 15_000;

export interface Presence {
  lastSeen: Record<string, number>;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('presence');
}

export function readPresence(doc: Y.Doc): Presence {
  const m = getMap(doc);
  const out: Record<string, number> = {};
  m.forEach((v, k) => {
    if (typeof v === 'number') out[k] = v;
  });
  return { lastSeen: out };
}

export function pingPresence(doc: Y.Doc, deviceId: string): void {
  getMap(doc).set(deviceId, Date.now());
}

export function isOnline(presence: Presence, deviceId: string, now: number = Date.now()): boolean {
  const ts = presence.lastSeen[deviceId];
  if (!ts) return false;
  return now - ts < ONLINE_WINDOW_MS;
}

export function bothOnline(
  presence: Presence,
  myId: string,
  partnerId: string | null,
  now: number = Date.now(),
): boolean {
  if (!partnerId) return false;
  return isOnline(presence, myId, now) && isOnline(presence, partnerId, now);
}
