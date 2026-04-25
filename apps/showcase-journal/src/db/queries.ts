import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  ENTRIES_TABLE,
  entriesSchema,
  type JournalEntry,
  type SentimentLabel,
  type Topic,
} from './schema.ts';

let initPromise: Promise<void> | null = null;

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await db.create(ENTRIES_TABLE, entriesSchema);
    })();
  }
  await initPromise;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listEntries(db: ShippieLocalDb): Promise<JournalEntry[]> {
  await ensureSchema(db);
  return db.query<JournalEntry>(ENTRIES_TABLE, { orderBy: { created_at: 'desc' } });
}

export async function listEntriesByTopic(db: ShippieLocalDb, topic: Topic): Promise<JournalEntry[]> {
  await ensureSchema(db);
  return db.query<JournalEntry>(ENTRIES_TABLE, { where: { topic }, orderBy: { created_at: 'desc' } });
}

export async function getEntry(db: ShippieLocalDb, id: string): Promise<JournalEntry | null> {
  await ensureSchema(db);
  const rows = await db.query<JournalEntry>(ENTRIES_TABLE, { where: { id }, limit: 1 });
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
  await db.insert(ENTRIES_TABLE, row);
  return row;
}

export async function updateEntry(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<JournalEntry, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<JournalEntry>(ENTRIES_TABLE, id, { ...patch, updated_at: new Date().toISOString() });
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
  return db.vectorSearch<JournalEntry>(ENTRIES_TABLE, vector, { limit });
}
