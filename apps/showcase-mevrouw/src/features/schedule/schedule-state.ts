/**
 * Schedule = shifts (per-day per-person work/off/busy/half) + trips
 * (multi-day visits with origin/destination/transport).
 *
 * Storage:
 *   - shifts: Y.Map keyed by `${user_id}|${date}` for fast random access
 *     and conflict-free per-day edits
 *   - trips:  Y.Array of Y.Map (one map per trip; mutable fields)
 */
import * as Y from 'yjs';
import type {
  DayParts,
  DaySegment,
  ItineraryItem,
  Shift,
  ShiftType,
  Trip,
} from '@/lib/schedule.ts';

function getShiftsMap(doc: Y.Doc): Y.Map<ShiftType> {
  return doc.getMap<ShiftType>('shifts');
}

function getDayPartsMap(doc: Y.Doc): Y.Map<DayParts> {
  return doc.getMap<DayParts>('shift-parts');
}

function getScheduleRefMap(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('schedule-refs');
}

function getTripsArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('trips');
}

const SHIFT_KEY = (userId: string, date: string) => `${userId}|${date}`;

export function readShifts(doc: Y.Doc): Shift[] {
  const out: Shift[] = [];
  getShiftsMap(doc).forEach((shift_type, key) => {
    const [user_id, date] = key.split('|');
    if (user_id && date) out.push({ user_id, date, shift_type });
  });
  return out;
}

export function setShift(doc: Y.Doc, userId: string, date: string, type: ShiftType): void {
  const map = getShiftsMap(doc);
  const key = SHIFT_KEY(userId, date);
  if (type === null) map.delete(key);
  else map.set(key, type);
}

// ── Day parts (morning / afternoon / evening overrides) ────────────────

export function readDayPartsAll(doc: Y.Doc): Record<string, DayParts> {
  const out: Record<string, DayParts> = {};
  getDayPartsMap(doc).forEach((parts, key) => {
    out[key] = parts;
  });
  return out;
}

export function readDayParts(doc: Y.Doc, userId: string, date: string): DayParts | undefined {
  return getDayPartsMap(doc).get(SHIFT_KEY(userId, date));
}

export function setDayPart(
  doc: Y.Doc,
  userId: string,
  date: string,
  segment: DaySegment,
  type: ShiftType,
): void {
  doc.transact(() => {
    const map = getDayPartsMap(doc);
    const key = SHIFT_KEY(userId, date);
    const existing: DayParts = { ...(map.get(key) ?? {}) };
    if (type === null && !(segment in existing)) {
      // No-op: clearing an unset segment.
      return;
    }
    existing[segment] = type;
    // If every segment cleared, drop the key.
    const stillSet = (['morning', 'afternoon', 'evening'] as DaySegment[]).filter(
      (s) => s in existing && existing[s] !== undefined && existing[s] !== null,
    );
    if (stillSet.length === 0) map.delete(key);
    else map.set(key, existing);
  });
}

export function clearDayParts(doc: Y.Doc, userId: string, date: string): void {
  getDayPartsMap(doc).delete(SHIFT_KEY(userId, date));
}

// ── Schedule reference photo (per-user) ────────────────────────────────

export function readScheduleRef(doc: Y.Doc, userId: string): string | null {
  return getScheduleRefMap(doc).get(userId) ?? null;
}

export function readScheduleRefsAll(doc: Y.Doc): Record<string, string> {
  const out: Record<string, string> = {};
  getScheduleRefMap(doc).forEach((dataUrl, userId) => {
    if (typeof dataUrl === 'string' && dataUrl.length > 0) out[userId] = dataUrl;
  });
  return out;
}

export function setScheduleRef(doc: Y.Doc, userId: string, dataUrl: string): void {
  getScheduleRefMap(doc).set(userId, dataUrl);
}

export function clearScheduleRef(doc: Y.Doc, userId: string): void {
  getScheduleRefMap(doc).delete(userId);
}

export function readTrips(doc: Y.Doc): Trip[] {
  return getTripsArray(doc)
    .toArray()
    .map((m) => readTripMap(m))
    .sort((a, b) => a.depart_at.localeCompare(b.depart_at));
}

export function readTripMap(map: Y.Map<unknown>): Trip {
  return {
    id: (map.get('id') as string | undefined) ?? '',
    traveller_id: (map.get('traveller_id') as string | undefined) ?? '',
    origin_city: (map.get('origin_city') as string | undefined) ?? '',
    destination_city: (map.get('destination_city') as string | undefined) ?? '',
    depart_at: (map.get('depart_at') as string | undefined) ?? '',
    return_at: (map.get('return_at') as string | undefined) ?? '',
    transport: (map.get('transport') as string | null | undefined) ?? null,
    transport_ref: (map.get('transport_ref') as string | null | undefined) ?? null,
    notes: (map.get('notes') as string | null | undefined) ?? null,
    is_anniversary_flag: !!map.get('is_anniversary_flag'),
    plans: (map.get('plans') as string | undefined) ?? '',
    itinerary: (map.get('itinerary') as ItineraryItem[] | undefined) ?? [],
    photos: (map.get('photos') as string[] | undefined) ?? [],
  };
}

export function findTripMap(doc: Y.Doc, id: string): Y.Map<unknown> | null {
  const arr = getTripsArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') === id) return m;
  }
  return null;
}

export function setTripPlans(doc: Y.Doc, id: string, plans: string): void {
  const m = findTripMap(doc, id);
  if (m) m.set('plans', plans);
}

export function addItineraryItem(
  doc: Y.Doc,
  tripId: string,
  item: Omit<ItineraryItem, 'id'>,
): void {
  const m = findTripMap(doc, tripId);
  if (!m) return;
  const existing = (m.get('itinerary') as ItineraryItem[] | undefined) ?? [];
  const next: ItineraryItem = { id: uuid(), at: item.at, label: item.label };
  m.set(
    'itinerary',
    [...existing, next].sort((a, b) => a.at.localeCompare(b.at)),
  );
}

export function deleteItineraryItem(doc: Y.Doc, tripId: string, itemId: string): void {
  const m = findTripMap(doc, tripId);
  if (!m) return;
  const existing = (m.get('itinerary') as ItineraryItem[] | undefined) ?? [];
  m.set(
    'itinerary',
    existing.filter((it) => it.id !== itemId),
  );
}

export function addTripPhoto(doc: Y.Doc, tripId: string, dataUrl: string): void {
  const m = findTripMap(doc, tripId);
  if (!m) return;
  const existing = (m.get('photos') as string[] | undefined) ?? [];
  m.set('photos', [...existing, dataUrl]);
}

export function deleteTripPhoto(doc: Y.Doc, tripId: string, idx: number): void {
  const m = findTripMap(doc, tripId);
  if (!m) return;
  const existing = (m.get('photos') as string[] | undefined) ?? [];
  m.set(
    'photos',
    existing.filter((_, i) => i !== idx),
  );
}

export function addTrip(
  doc: Y.Doc,
  fields: Omit<Trip, 'id' | 'plans' | 'itinerary' | 'photos'>,
): Trip {
  const id = uuid();
  const map = new Y.Map<unknown>();
  doc.transact(() => {
    map.set('id', id);
    map.set('traveller_id', fields.traveller_id);
    map.set('origin_city', fields.origin_city);
    map.set('destination_city', fields.destination_city);
    map.set('depart_at', fields.depart_at);
    map.set('return_at', fields.return_at);
    map.set('transport', fields.transport);
    map.set('transport_ref', fields.transport_ref);
    map.set('notes', fields.notes);
    map.set('is_anniversary_flag', fields.is_anniversary_flag);
    map.set('plans', '');
    map.set('itinerary', [] as ItineraryItem[]);
    map.set('photos', [] as string[]);
    getTripsArray(doc).push([map]);
  });
  return readTripMap(map);
}

export function deleteTrip(doc: Y.Doc, id: string): boolean {
  const arr = getTripsArray(doc);
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
