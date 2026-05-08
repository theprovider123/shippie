/**
 * Touch — local-first schema for the 30-people Rolodex.
 *
 * Five tables, all owned by this app. Nothing leaves the device unless
 * the human pulls the CSV export trigger themselves.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const PEOPLE_TABLE = 'people';
export const TOUCHES_TABLE = 'touches';
export const TAGS_TABLE = 'tags';
export const PERSON_TAGS_TABLE = 'person_tags';
export const TASKS_TABLE = 'tasks';

export const peopleSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  role: 'text',
  company: 'text',
  email: 'text',
  phone: 'text',
  notes_md: 'text',
  cadence_days: 'integer',
  last_touch_at: 'datetime',
  next_touch_at: 'datetime',
  photo_url: 'text',
  archived: 'integer',
  created_at: 'datetime',
};

export const touchesSchema: LocalDbSchema = {
  id: 'text primary key',
  person_id: 'text not null',
  kind: 'text not null',
  happened_at: 'datetime',
  summary: 'text',
  link_url: 'text',
  sentiment: 'text',
};

export const tagsSchema: LocalDbSchema = {
  id: 'text primary key',
  label: 'text not null',
};

export const personTagsSchema: LocalDbSchema = {
  id: 'text primary key',
  person_id: 'text not null',
  tag_id: 'text not null',
};

export const tasksSchema: LocalDbSchema = {
  id: 'text primary key',
  person_id: 'text not null',
  body: 'text not null',
  due_at: 'datetime',
  done_at: 'datetime',
  created_at: 'datetime',
};

export type TouchKind = 'call' | 'email' | 'coffee' | 'dm' | 'event' | 'note';
export type Sentiment = '+' | '-' | '0';

export const TOUCH_KINDS: ReadonlyArray<TouchKind> = [
  'call',
  'email',
  'coffee',
  'dm',
  'event',
  'note',
];

export const TOUCH_KIND_LABEL: Record<TouchKind, string> = {
  call: 'Call',
  email: 'Email',
  coffee: 'Coffee',
  dm: 'DM',
  event: 'Event',
  note: 'Note',
};

export const TOUCH_KIND_ICON: Record<TouchKind, string> = {
  call: '☎',
  email: '✉',
  coffee: '☕',
  dm: '✦',
  event: '◆',
  note: '✎',
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  '+': 'good',
  '0': 'neutral',
  '-': 'rough',
};

export interface Person {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes_md: string | null;
  /** Per-person cadence override in days. Null → use default. */
  cadence_days: number | null;
  last_touch_at: string | null;
  next_touch_at: string | null;
  photo_url: string | null;
  /** 0 or 1 — local-db's integer flag. */
  archived: 0 | 1;
  created_at: string;
}

export interface Touch {
  id: string;
  person_id: string;
  kind: TouchKind;
  happened_at: string;
  summary: string;
  link_url: string | null;
  sentiment: Sentiment;
}

export interface Tag {
  id: string;
  label: string;
}

export interface PersonTag {
  id: string;
  person_id: string;
  tag_id: string;
}

export interface Task {
  id: string;
  person_id: string;
  body: string;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
}
