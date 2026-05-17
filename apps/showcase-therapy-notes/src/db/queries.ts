import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  CHECKINS_TABLE,
  NOTES_TABLE,
  PREP_LISTS_TABLE,
  checkinsSchema,
  notesSchema,
  prepListsSchema,
  type Checkin,
  type Note,
  type NoteKind,
  type PrepList,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(NOTES_TABLE, notesSchema);
      await db.create(CHECKINS_TABLE, checkinsSchema);
      await db.create(PREP_LISTS_TABLE, prepListsSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Local YYYY-MM-DD for a Date (or now). */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── notes ──────────────────────────────────────────────────────────

export interface CreateNoteInput {
  id?: string;
  kind: NoteKind;
  title?: string | null;
  body_md: string;
  occurred_at?: string;
}

export async function createNote(db: ShippieLocalDb, input: CreateNoteInput): Promise<Note> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const row: Note = {
    id: input.id ?? newId(),
    kind: input.kind,
    title: input.title ?? null,
    body_md: input.body_md,
    occurred_at: input.occurred_at ?? now,
    created_at: now,
  };
  await db.insert(NOTES_TABLE, asRow(row));
  return row;
}

export async function listNotes(db: ShippieLocalDb, limit?: number): Promise<Note[]> {
  await ensureSchema(db);
  return db.query<RowOf<Note>>(NOTES_TABLE, { orderBy: { occurred_at: 'desc' }, limit });
}

export async function getNote(db: ShippieLocalDb, id: string): Promise<Note | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Note>>(NOTES_TABLE, { where: { id }, limit: 1 });
  return rows[0] ?? null;
}

export async function deleteNote(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(NOTES_TABLE, id);
}

/** Notes whose `occurred_at` ISO string falls in [fromIso, toIso]. */
export async function listNotesInRange(
  db: ShippieLocalDb,
  fromIso: string,
  toIso: string,
): Promise<Note[]> {
  await ensureSchema(db);
  const all = await db.query<RowOf<Note>>(NOTES_TABLE, { orderBy: { occurred_at: 'asc' } });
  return all.filter((n) => n.occurred_at >= fromIso && n.occurred_at <= toIso);
}

// ── checkins ───────────────────────────────────────────────────────

export interface CreateCheckinInput {
  id?: string;
  occurred_on?: string;
  mood_1to5?: number | null;
  anxiety_1to5?: number | null;
  sleep_hours?: number | null;
  note?: string | null;
}

export async function createCheckin(db: ShippieLocalDb, input: CreateCheckinInput): Promise<Checkin> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const row: Checkin = {
    id: input.id ?? newId(),
    occurred_on: input.occurred_on ?? localDateString(),
    mood_1to5: input.mood_1to5 ?? null,
    anxiety_1to5: input.anxiety_1to5 ?? null,
    sleep_hours: input.sleep_hours ?? null,
    note: input.note ?? null,
    created_at: now,
  };
  await db.insert(CHECKINS_TABLE, asRow(row));
  return row;
}

export async function listCheckins(db: ShippieLocalDb, limit?: number): Promise<Checkin[]> {
  await ensureSchema(db);
  return db.query<RowOf<Checkin>>(CHECKINS_TABLE, { orderBy: { occurred_on: 'desc' }, limit });
}

/** Check-ins on or after `fromDate` (YYYY-MM-DD), oldest first. */
export async function listCheckinsSince(db: ShippieLocalDb, fromDate: string): Promise<Checkin[]> {
  await ensureSchema(db);
  const all = await db.query<RowOf<Checkin>>(CHECKINS_TABLE, { orderBy: { occurred_on: 'asc' } });
  return all.filter((c) => c.occurred_on >= fromDate);
}

// ── prep lists ─────────────────────────────────────────────────────

export interface CreatePrepListInput {
  id?: string;
  label?: string | null;
  body_md: string;
  occurred_at?: string;
}

export async function createPrepList(
  db: ShippieLocalDb,
  input: CreatePrepListInput,
): Promise<PrepList> {
  await ensureSchema(db);
  const row: PrepList = {
    id: input.id ?? newId(),
    label: input.label ?? null,
    body_md: input.body_md,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  };
  await db.insert(PREP_LISTS_TABLE, asRow(row));
  return row;
}

export async function listPrepLists(db: ShippieLocalDb, limit?: number): Promise<PrepList[]> {
  await ensureSchema(db);
  return db.query<RowOf<PrepList>>(PREP_LISTS_TABLE, { orderBy: { occurred_at: 'desc' }, limit });
}

export async function getLatestPrepList(db: ShippieLocalDb): Promise<PrepList | null> {
  const rows = await listPrepLists(db, 1);
  return rows[0] ?? null;
}

export async function updatePrepList(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<PrepList, 'id'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<PrepList>>(PREP_LISTS_TABLE, id, asRow(patch));
}

export async function deletePrepList(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(PREP_LISTS_TABLE, id);
}
