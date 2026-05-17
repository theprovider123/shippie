/**
 * The Trip Y.Doc — what companions see in real time.
 *
 * Layers:
 *  1. y-indexeddb persistence keyed on room id, so a peer that drops
 *     and rejoins doesn't lose the in-progress trip.
 *  2. RelayProvider WebSocket sync via the Shippie SignalRoom DO. All
 *     traffic is AES-GCM encrypted with a key derived from the room
 *     code (see ./crypto.ts). The DO never sees plaintext.
 *
 * Doc shape:
 *  - `meta` (Y.Map): { name: string; started_on: string; members: Y.Array<string> }
 *  - `stops` (Y.Array<Y.Map>): each entry mirrors the local `Stop` row
 *    minus photo blobs (photos stay on-device by design).
 *
 * The shared trip is ephemeral: the room expires when the last peer
 * leaves. Companions who want a permanent copy take a manual "save to
 * my trips" action, which materialises the Y.Array into local DB rows.
 */
import * as Y from 'yjs';
import type { Stop } from '../db/schema.ts';

export interface SharedStop {
  id: string;
  lat: number;
  lon: number;
  label?: string | null;
  captured_at: string;
  note?: string | null;
  /** Peer id that pinned the stop — used for attribution in the UI. */
  pinned_by?: string | null;
}

export interface TripMeta {
  name: string;
  started_on: string;
  members: string[];
}

export const META_KEY = 'meta';
export const STOPS_KEY = 'stops';

export function createTripDoc(): Y.Doc {
  return new Y.Doc();
}

/**
 * Initialise meta if empty. Idempotent — calling twice on the same
 * doc preserves whatever's already there. Only sets defaults the
 * caller hasn't supplied; never overwrites a remote write that came in
 * before initialisation finished.
 */
export function initMeta(doc: Y.Doc, partial: Partial<TripMeta> & { name: string }): void {
  const meta = doc.getMap<unknown>(META_KEY);
  doc.transact(() => {
    if (!meta.has('name')) meta.set('name', partial.name);
    if (!meta.has('started_on')) {
      meta.set('started_on', partial.started_on ?? new Date().toISOString());
    }
    if (!meta.has('members')) {
      const arr = new Y.Array<string>();
      for (const m of partial.members ?? []) arr.push([m]);
      meta.set('members', arr);
    }
  });
}

export function readMeta(doc: Y.Doc): TripMeta {
  const meta = doc.getMap<unknown>(META_KEY);
  const membersAny = meta.get('members');
  let members: string[] = [];
  if (membersAny instanceof Y.Array) {
    members = membersAny.toArray() as string[];
  } else if (Array.isArray(membersAny)) {
    members = membersAny as string[];
  }
  return {
    name: String(meta.get('name') ?? ''),
    started_on: String(meta.get('started_on') ?? ''),
    members,
  };
}

export function addMember(doc: Y.Doc, peerId: string): void {
  const meta = doc.getMap<unknown>(META_KEY);
  let arr = meta.get('members');
  if (!(arr instanceof Y.Array)) {
    arr = new Y.Array<string>();
    meta.set('members', arr);
  }
  const existing = (arr as Y.Array<string>).toArray();
  if (!existing.includes(peerId)) (arr as Y.Array<string>).push([peerId]);
}

export function pinSharedStop(doc: Y.Doc, stop: SharedStop): void {
  const stops = doc.getArray<Y.Map<unknown>>(STOPS_KEY);
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', stop.id);
    m.set('lat', stop.lat);
    m.set('lon', stop.lon);
    m.set('label', stop.label ?? null);
    m.set('captured_at', stop.captured_at);
    m.set('note', stop.note ?? null);
    m.set('pinned_by', stop.pinned_by ?? null);
    stops.push([m]);
  });
}

export function readSharedStops(doc: Y.Doc): SharedStop[] {
  const stops = doc.getArray<Y.Map<unknown>>(STOPS_KEY);
  const out: SharedStop[] = [];
  for (const m of stops) {
    out.push({
      id: String(m.get('id') ?? ''),
      lat: Number(m.get('lat') ?? 0),
      lon: Number(m.get('lon') ?? 0),
      label: (m.get('label') ?? null) as string | null,
      captured_at: String(m.get('captured_at') ?? ''),
      note: (m.get('note') ?? null) as string | null,
      pinned_by: (m.get('pinned_by') ?? null) as string | null,
    });
  }
  return out;
}

/**
 * Convert a local DB Stop into a shared-shaped SharedStop. Strips the
 * photo_id — photos never leave the device.
 */
export function localStopToShared(stop: Stop, peerId?: string): SharedStop {
  return {
    id: stop.id,
    lat: stop.lat,
    lon: stop.lon,
    label: stop.label ?? null,
    captured_at: stop.captured_at ?? new Date().toISOString(),
    note: stop.note ?? null,
    pinned_by: peerId ?? null,
  };
}
