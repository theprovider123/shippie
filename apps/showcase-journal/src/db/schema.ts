/**
 * Journal database schema. Single `entries` table; embeddings live in
 * `embedding` as a blob (Float32Array). Encryption-at-rest is enforced
 * by the underlying engine (SQLCipher when available, plain wa-sqlite
 * with a notice when not).
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const ENTRIES_TABLE = 'entries';

export const entriesSchema: LocalDbSchema = {
  id: 'text primary key',
  title: 'text',
  body: 'text not null',
  sentiment: 'real',
  sentiment_label: 'text',
  topic: 'text',
  embedding: 'blob',
  created_at: 'datetime',
  updated_at: 'datetime',
};

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export const TOPIC_LABELS = ['work', 'relationships', 'health', 'hobbies'] as const;
export type Topic = (typeof TOPIC_LABELS)[number] | 'unclassified';

export interface JournalEntry {
  id: string;
  title?: string | null;
  body: string;
  sentiment?: number | null;
  sentiment_label?: SentimentLabel | null;
  topic?: Topic | null;
  embedding?: Float32Array | null;
  created_at?: string;
  updated_at?: string;
}
