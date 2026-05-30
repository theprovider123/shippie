/**
 * Local-DB schema for Ledger.
 *
 * Three tables: entries, categories, recurring. All data lives in
 * wa-sqlite + OPFS via @shippie/local-db. Data stays on the device
 * unless the user explicitly exports CSV or backs up.
 *
 * Money is stored as integer cents to avoid float drift on aggregates.
 * Currency is per-row but in practice single-currency per ledger;
 * the app's settings hold the user-chosen default.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const ENTRIES_TABLE = 'entries';
export const CATEGORIES_TABLE = 'categories';
export const RECURRING_TABLE = 'recurring';
export const SETTINGS_TABLE = 'settings';

export const entriesSchema: LocalDbSchema = {
  id: 'text primary key',
  kind: 'text not null',
  amount_cents: 'integer not null',
  currency: 'text not null',
  category_id: 'text',
  note: 'text',
  occurred_on: 'text not null',
  created_at: 'datetime',
};

export const categoriesSchema: LocalDbSchema = {
  id: 'text primary key',
  label: 'text not null',
  sort_order: 'integer',
};

export const recurringSchema: LocalDbSchema = {
  id: 'text primary key',
  kind: 'text not null',
  amount_cents: 'integer not null',
  currency: 'text not null',
  category_id: 'text',
  note: 'text',
  cadence: 'text not null',
  next_due: 'text not null',
  active: 'integer not null',
};

export const settingsSchema: LocalDbSchema = {
  id: 'text primary key',
  value: 'text',
};

export type EntryKind = 'spend' | 'income';
export type Cadence = 'monthly' | 'weekly' | 'fortnightly';

export interface Entry {
  id: string;
  kind: EntryKind;
  amount_cents: number;
  currency: string;
  category_id?: string | null;
  note?: string | null;
  occurred_on: string; // ISO date YYYY-MM-DD
  created_at?: string;
}

export interface Category {
  id: string;
  label: string;
  sort_order?: number | null;
}

export interface Recurring {
  id: string;
  kind: EntryKind;
  amount_cents: number;
  currency: string;
  category_id?: string | null;
  note?: string | null;
  cadence: Cadence;
  next_due: string; // ISO date YYYY-MM-DD
  active: number; // 1 = active, 0 = stopped
}

export interface Settings {
  id: string;
  value?: string | null;
}

export const DEFAULT_CURRENCY = 'GBP';
export const DEFAULT_CATEGORIES: Array<{ label: string; sort_order: number }> = [
  { label: 'Food', sort_order: 0 },
  { label: 'Transport', sort_order: 1 },
  { label: 'Bills', sort_order: 2 },
  { label: 'Other', sort_order: 3 },
];
