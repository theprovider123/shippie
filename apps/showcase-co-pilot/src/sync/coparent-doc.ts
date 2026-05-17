/**
 * Co-Parent Y.Doc — every piece of shared state lives here, in its own
 * named map/array.
 *
 * Shape:
 *   meta       : Y.Map  — paired_at, last_seen_a, last_seen_b
 *   schedule   : Y.Map  — keyed by ISO date 'YYYY-MM-DD' →
 *                          { with_parent: 'a'|'b', activities: Y.Array<string> }
 *   meds       : Y.Array — { id, kid_name, med_name, dose, schedule_text, active }
 *   med_doses  : Y.Array — { id, med_id, given_by, given_at, note }
 *   handover   : Y.Array — { id, author, body, written_at, acked_at }
 *
 * Handover entries are NEVER deleted. They can be acked but the row
 * survives. This is deliberate — the record may matter to a third
 * party at some future point.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { bindRelayProvider, type RelayProvider } from './relay-provider.ts';
import type { ParentRole } from './pairing.ts';

export interface BoundCoParentDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
  relay: RelayProvider | null;
  destroy: () => void;
}

export function bindCoParentDoc(roomId: string, pairCode?: string): BoundCoParentDoc {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(roomId, doc);
  const whenSynced = new Promise<void>((resolve) => {
    persistence.once('synced', () => resolve());
  });

  let relay: RelayProvider | null = null;
  if (pairCode && typeof WebSocket !== 'undefined') {
    relay = bindRelayProvider({ doc, roomId, pairCode });
  }

  return {
    doc,
    persistence,
    relay,
    whenSynced,
    destroy: () => {
      relay?.destroy();
      void persistence.destroy();
      doc.destroy();
    },
  };
}

// ── Types ────────────────────────────────────────────────────────────

export interface CoParentMeta {
  paired_at: number;
  last_seen_a: number;
  last_seen_b: number;
}

export interface ScheduleDay {
  with_parent: ParentRole;
  activities: readonly string[];
  /** Optional one-off note attached to the date (handover-style, not the main thread). */
  note?: string;
}

export interface MedItem {
  id: string;
  kid_name: string;
  med_name: string;
  dose: string;
  schedule_text: string;
  active: boolean;
  created_at: number;
}

export interface MedDose {
  id: string;
  med_id: string;
  given_by: ParentRole;
  given_at: number;
  note: string;
}

export interface HandoverEntry {
  id: string;
  author: ParentRole;
  body: string;
  written_at: number;
  /** Wall-clock ms when the OTHER parent acknowledged this entry. null = unacked. */
  acked_at: number | null;
}

// ── Map accessors ────────────────────────────────────────────────────

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function getSchedule(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('schedule');
}

export function getMeds(doc: Y.Doc): Y.Array<MedItem> {
  return doc.getArray<MedItem>('meds');
}

export function getMedDoses(doc: Y.Doc): Y.Array<MedDose> {
  return doc.getArray<MedDose>('med_doses');
}

export function getHandover(doc: Y.Doc): Y.Array<HandoverEntry> {
  return doc.getArray<HandoverEntry>('handover');
}

// ── Reads ────────────────────────────────────────────────────────────

export function readMeta(doc: Y.Doc): CoParentMeta {
  const m = getMeta(doc);
  return {
    paired_at: (m.get('paired_at') as number | undefined) ?? 0,
    last_seen_a: (m.get('last_seen_a') as number | undefined) ?? 0,
    last_seen_b: (m.get('last_seen_b') as number | undefined) ?? 0,
  };
}

export function readScheduleDay(doc: Y.Doc, isoDate: string): ScheduleDay | null {
  const day = getSchedule(doc).get(isoDate);
  if (!day) return null;
  const with_parent = day.get('with_parent') as ParentRole | undefined;
  if (with_parent !== 'a' && with_parent !== 'b') return null;
  const activitiesY = day.get('activities') as Y.Array<string> | undefined;
  const note = day.get('note') as string | undefined;
  return {
    with_parent,
    activities: activitiesY ? activitiesY.toArray() : [],
    note,
  };
}

export function readScheduleRange(doc: Y.Doc, startISO: string, days: number): Map<string, ScheduleDay> {
  const out = new Map<string, ScheduleDay>();
  const start = new Date(startISO + 'T00:00:00');
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoDateOf(d);
    const day = readScheduleDay(doc, iso);
    if (day) out.set(iso, day);
  }
  return out;
}

export function readMeds(doc: Y.Doc): readonly MedItem[] {
  return getMeds(doc).toArray();
}

export function readActiveMeds(doc: Y.Doc): readonly MedItem[] {
  return readMeds(doc).filter((m) => m.active);
}

export function readMedDoses(doc: Y.Doc): readonly MedDose[] {
  return getMedDoses(doc).toArray();
}

export function readDosesForMed(doc: Y.Doc, medId: string, limit = 50): readonly MedDose[] {
  return readMedDoses(doc)
    .filter((d) => d.med_id === medId)
    .sort((a, b) => b.given_at - a.given_at)
    .slice(0, limit);
}

export function readHandover(doc: Y.Doc): readonly HandoverEntry[] {
  return getHandover(doc).toArray();
}

export function readHandoverChronological(doc: Y.Doc): readonly HandoverEntry[] {
  return [...readHandover(doc)].sort((a, b) => a.written_at - b.written_at);
}

export function readUnreadHandoverFor(doc: Y.Doc, viewer: ParentRole): readonly HandoverEntry[] {
  return readHandover(doc).filter((e) => e.author !== viewer && !e.acked_at);
}

// ── Writes ───────────────────────────────────────────────────────────

export function setMetaField(doc: Y.Doc, field: keyof CoParentMeta, value: number): void {
  getMeta(doc).set(field, value);
}

export function touchLastSeen(doc: Y.Doc, role: ParentRole): void {
  setMetaField(doc, role === 'a' ? 'last_seen_a' : 'last_seen_b', Date.now());
}

export function setScheduleDay(
  doc: Y.Doc,
  isoDate: string,
  with_parent: ParentRole,
): void {
  doc.transact(() => {
    const schedule = getSchedule(doc);
    let day = schedule.get(isoDate);
    if (!day) {
      day = new Y.Map<unknown>();
      day.set('activities', new Y.Array<string>());
      schedule.set(isoDate, day);
    }
    day.set('with_parent', with_parent);
  });
}

export function setScheduleNote(doc: Y.Doc, isoDate: string, note: string): void {
  doc.transact(() => {
    const schedule = getSchedule(doc);
    let day = schedule.get(isoDate);
    if (!day) {
      day = new Y.Map<unknown>();
      day.set('activities', new Y.Array<string>());
      schedule.set(isoDate, day);
    }
    if (note.trim().length === 0) {
      day.delete('note');
    } else {
      day.set('note', note.trim());
    }
  });
}

export function addScheduleActivity(doc: Y.Doc, isoDate: string, activity: string): void {
  const trimmed = activity.trim();
  if (!trimmed) return;
  doc.transact(() => {
    const schedule = getSchedule(doc);
    let day = schedule.get(isoDate);
    if (!day) {
      day = new Y.Map<unknown>();
      day.set('activities', new Y.Array<string>());
      schedule.set(isoDate, day);
    }
    const activities = day.get('activities') as Y.Array<string> | undefined;
    if (activities) activities.push([trimmed]);
  });
}

export interface NewMedInput {
  kid_name: string;
  med_name: string;
  dose: string;
  schedule_text: string;
}

export function addMed(doc: Y.Doc, input: NewMedInput): MedItem {
  const med: MedItem = {
    id: cryptoRandomId(),
    kid_name: input.kid_name.trim(),
    med_name: input.med_name.trim(),
    dose: input.dose.trim(),
    schedule_text: input.schedule_text.trim(),
    active: true,
    created_at: Date.now(),
  };
  getMeds(doc).push([med]);
  return med;
}

export function deactivateMed(doc: Y.Doc, medId: string): void {
  const meds = getMeds(doc);
  const arr = meds.toArray();
  const idx = arr.findIndex((m) => m.id === medId);
  if (idx < 0) return;
  const existing = arr[idx];
  if (!existing) return;
  doc.transact(() => {
    meds.delete(idx, 1);
    meds.insert(idx, [{ ...existing, active: false }]);
  });
}

export function logMedDose(
  doc: Y.Doc,
  med_id: string,
  given_by: ParentRole,
  note: string = '',
): MedDose {
  const dose: MedDose = {
    id: cryptoRandomId(),
    med_id,
    given_by,
    given_at: Date.now(),
    note: note.trim(),
  };
  getMedDoses(doc).push([dose]);
  return dose;
}

export function addHandoverEntry(
  doc: Y.Doc,
  author: ParentRole,
  body: string,
): HandoverEntry | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const entry: HandoverEntry = {
    id: cryptoRandomId(),
    author,
    body: trimmed,
    written_at: Date.now(),
    acked_at: null,
  };
  getHandover(doc).push([entry]);
  return entry;
}

/**
 * Acknowledge a handover entry. Replaces the row in-place with acked_at
 * set to now. The entry is NEVER deleted — this is by design.
 */
export function ackHandoverEntry(doc: Y.Doc, entryId: string, viewer: ParentRole): void {
  const arr = getHandover(doc);
  const items = arr.toArray();
  const idx = items.findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  const existing = items[idx];
  if (!existing) return;
  // Only the OTHER parent can ack their counterpart's entry.
  if (existing.author === viewer) return;
  if (existing.acked_at) return;
  doc.transact(() => {
    arr.delete(idx, 1);
    arr.insert(idx, [{ ...existing, acked_at: Date.now() }]);
  });
}

// ── Utilities ────────────────────────────────────────────────────────

export function isoDateOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): string {
  return isoDateOf(now);
}

export function startOfWeekISO(now: Date = new Date()): string {
  const d = new Date(now);
  const dow = d.getDay(); // 0 = Sun
  // Monday-anchored week
  const diff = (dow + 6) % 7;
  d.setDate(d.getDate() - diff);
  return isoDateOf(d);
}

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export type { Doc as YDoc } from 'yjs';
