import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  ENTRIES_TABLE,
  entriesSchema,
  type JournalEntry,
  type SentimentLabel,
  type Topic,
} from './schema.ts';

// Local-DB rows use an `unknown` index signature; our typed entries satisfy
// the underlying SQL shape but TypeScript doesn't see them as assignable.
// Cast at the boundary so the rest of the app stays well-typed.
type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(ENTRIES_TABLE, entriesSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listEntries(db: ShippieLocalDb): Promise<JournalEntry[]> {
  await ensureSchema(db);
  return db.query<RowOf<JournalEntry>>(ENTRIES_TABLE, { orderBy: { created_at: 'desc' } });
}

export async function listEntriesByTopic(db: ShippieLocalDb, topic: Topic): Promise<JournalEntry[]> {
  await ensureSchema(db);
  return db.query<RowOf<JournalEntry>>(ENTRIES_TABLE, { where: { topic }, orderBy: { created_at: 'desc' } });
}

export async function getEntry(db: ShippieLocalDb, id: string): Promise<JournalEntry | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<JournalEntry>>(ENTRIES_TABLE, { where: { id }, limit: 1 });
  return rows[0] ?? null;
}

export interface CreateEntryInput {
  id?: string;
  title?: string | null;
  body: string;
  sentiment?: number | null;
  sentiment_label?: SentimentLabel | null;
  topic?: Topic | null;
  embedding?: Float32Array | null;
}

export async function createEntry(db: ShippieLocalDb, input: CreateEntryInput): Promise<JournalEntry> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const row: JournalEntry = {
    id: input.id ?? newId(),
    title: input.title ?? null,
    body: input.body,
    sentiment: input.sentiment ?? null,
    sentiment_label: input.sentiment_label ?? null,
    topic: input.topic ?? null,
    embedding: input.embedding ?? null,
    created_at: now,
    updated_at: now,
  };
  await db.insert(ENTRIES_TABLE, asRow(row));
  return row;
}

export async function updateEntry(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<JournalEntry, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<JournalEntry>>(ENTRIES_TABLE, id, asRow({ ...patch, updated_at: new Date().toISOString() }));
}

export async function deleteEntry(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(ENTRIES_TABLE, id);
}

export async function searchByVector(
  db: ShippieLocalDb,
  vector: Float32Array,
  limit = 10,
): Promise<Array<JournalEntry & { score: number }>> {
  await ensureSchema(db);
  return db.vectorSearch<RowOf<JournalEntry>>(ENTRIES_TABLE, vector, { limit });
}
