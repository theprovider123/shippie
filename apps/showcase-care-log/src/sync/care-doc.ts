/**
 * Care Y.Doc — the shared state for one care recipient.
 *
 * Shape:
 *   meta            : Y.Map  — recipient_name, paired_at, last_seen_a, last_seen_b
 *   meds            : Y.Array — { id, name, dose, schedule_text, active, started_at }
 *   med_doses       : Y.Array — { id, med_id, given_at, given_by, note?, missed? }
 *   symptoms        : Y.Array — { id, label, intensity, occurred_at, note?, logged_by }
 *   handover_notes  : Y.Array — { id, author, body, written_at, acked_at? }
 *   prefs           : Y.Map   — paired (bool), pair_code, recipient_view ("full"|"summary"|"off")
 *
 * Handover notes are NEVER deletable. They can be acked but the row
 * survives. This is by design — for caregivers, the audit trail is
 * load-bearing.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { bindRelayProvider, type RelayProvider } from './relay-provider.ts';
import type { CaregiverRole } from './pairing.ts';

export interface BoundCareDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
  relay: RelayProvider | null;
  destroy: () => void;
}

export function bindCareDoc(roomId: string, pairCode?: string): BoundCareDoc {
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

export type RecipientView = 'full' | 'summary' | 'off';

export interface CareMeta {
  recipient_name: string;
  paired_at: number;
  last_seen_a: number;
  last_seen_b: number;
}

export interface MedItem {
  id: string;
  name: string;
  dose: string;
  /** Free text — "3x daily after meals", "every 6 hours", "morning + evening". */
  schedule_text: string;
  active: boolean;
  started_at: number;
}

export interface MedDose {
  id: string;
  med_id: string;
  given_at: number;
  given_by: CaregiverRole;
  note: string;
  /** True when the row records a MISSED dose, not a given one. */
  missed: boolean;
}

export type SymptomIntensity = 1 | 2 | 3 | 4 | 5;

export interface SymptomEntry {
  id: string;
  /** Short label — "headache", "nausea", "good mood", "slept well". */
  label: string;
  /** 1-5 if numeric, or 0 to mean "yes/observed" without intensity. */
  intensity: SymptomIntensity | 0;
  occurred_at: number;
  note: string;
  logged_by: CaregiverRole;
}

export interface HandoverNote {
  id: string;
  author: CaregiverRole;
  body: string;
  written_at: number;
  /** Wall-clock ms when the OTHER caregiver acknowledged this. null = unacked. */
  acked_at: number | null;
}

export interface CarePrefs {
  paired: boolean;
  pair_code: string;
  /** Recipient's view-into-their-own-data preference. v1 just stores it; the third-device path is out of scope. */
  recipient_view: RecipientView;
}

// ── Map accessors ────────────────────────────────────────────────────

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function getMeds(doc: Y.Doc): Y.Array<MedItem> {
  return doc.getArray<MedItem>('meds');
}

export function getMedDoses(doc: Y.Doc): Y.Array<MedDose> {
  return doc.getArray<MedDose>('med_doses');
}

export function getSymptoms(doc: Y.Doc): Y.Array<SymptomEntry> {
  return doc.getArray<SymptomEntry>('symptoms');
}

export function getHandover(doc: Y.Doc): Y.Array<HandoverNote> {
  return doc.getArray<HandoverNote>('handover_notes');
}

export function getPrefs(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('prefs');
}

// ── Reads ────────────────────────────────────────────────────────────

export function readMeta(doc: Y.Doc): CareMeta {
  const m = getMeta(doc);
  return {
    recipient_name: (m.get('recipient_name') as string | undefined) ?? '',
    paired_at: (m.get('paired_at') as number | undefined) ?? 0,
    last_seen_a: (m.get('last_seen_a') as number | undefined) ?? 0,
    last_seen_b: (m.get('last_seen_b') as number | undefined) ?? 0,
  };
}

export function readPrefs(doc: Y.Doc): CarePrefs {
  const p = getPrefs(doc);
  return {
    paired: (p.get('paired') as boolean | undefined) ?? false,
    pair_code: (p.get('pair_code') as string | undefined) ?? '',
    recipient_view: ((p.get('recipient_view') as RecipientView | undefined) ?? 'off'),
  };
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

export function readSymptoms(doc: Y.Doc): readonly SymptomEntry[] {
  return getSymptoms(doc).toArray();
}

export function readSymptomsRecent(doc: Y.Doc, limit = 20): readonly SymptomEntry[] {
  return [...readSymptoms(doc)].sort((a, b) => b.occurred_at - a.occurred_at).slice(0, limit);
}

export function readHandover(doc: Y.Doc): readonly HandoverNote[] {
  return getHandover(doc).toArray();
}

export function readHandoverChronological(doc: Y.Doc): readonly HandoverNote[] {
  return [...readHandover(doc)].sort((a, b) => a.written_at - b.written_at);
}

export function readUnreadHandoverFor(doc: Y.Doc, viewer: CaregiverRole): readonly HandoverNote[] {
  return readHandover(doc).filter((e) => e.author !== viewer && !e.acked_at);
}

// ── Writes ───────────────────────────────────────────────────────────

export function setMetaField(doc: Y.Doc, field: keyof CareMeta, value: number | string): void {
  getMeta(doc).set(field, value);
}

export function setRecipientName(doc: Y.Doc, name: string): void {
  getMeta(doc).set('recipient_name', name.trim());
}

export function setPrefField<K extends keyof CarePrefs>(
  doc: Y.Doc,
  field: K,
  value: CarePrefs[K],
): void {
  getPrefs(doc).set(field, value as unknown);
}

export function touchLastSeen(doc: Y.Doc, role: CaregiverRole): void {
  setMetaField(doc, role === 'a' ? 'last_seen_a' : 'last_seen_b', Date.now());
}

export interface NewMedInput {
  name: string;
  dose: string;
  schedule_text: string;
}

export function addMed(doc: Y.Doc, input: NewMedInput): MedItem {
  const med: MedItem = {
    id: cryptoRandomId(),
    name: input.name.trim(),
    dose: input.dose.trim(),
    schedule_text: input.schedule_text.trim(),
    active: true,
    started_at: Date.now(),
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
  given_by: CaregiverRole,
  note: string = '',
  missed: boolean = false,
): MedDose {
  const dose: MedDose = {
    id: cryptoRandomId(),
    med_id,
    given_by,
    given_at: Date.now(),
    note: note.trim(),
    missed,
  };
  getMedDoses(doc).push([dose]);
  return dose;
}

export interface NewSymptomInput {
  label: string;
  intensity: SymptomIntensity | 0;
  note?: string;
  occurred_at?: number;
}

export function logSymptom(
  doc: Y.Doc,
  input: NewSymptomInput,
  logged_by: CaregiverRole,
): SymptomEntry | null {
  const label = input.label.trim();
  if (!label) return null;
  const entry: SymptomEntry = {
    id: cryptoRandomId(),
    label,
    intensity: input.intensity,
    occurred_at: input.occurred_at ?? Date.now(),
    note: (input.note ?? '').trim(),
    logged_by,
  };
  getSymptoms(doc).push([entry]);
  return entry;
}

export function addHandoverNote(
  doc: Y.Doc,
  author: CaregiverRole,
  body: string,
): HandoverNote | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const entry: HandoverNote = {
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
 * Acknowledge a handover note. Replaces the row in-place with acked_at
 * set to now. The entry is NEVER deleted — by design.
 */
export function ackHandoverNote(doc: Y.Doc, entryId: string, viewer: CaregiverRole): void {
  const arr = getHandover(doc);
  const items = arr.toArray();
  const idx = items.findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  const existing = items[idx];
  if (!existing) return;
  // Only the OTHER caregiver can ack their counterpart's entry.
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
