/**
 * Therapy Notes — local database schema.
 *
 * Three tables, all single-user, never replicated off-device:
 *   - notes:      free notes + filled-in worksheet output (markdown body).
 *   - checkins:   one daily quick check (mood / anxiety / sleep / one line).
 *   - prep_lists: bullets the user wants to bring to the next session.
 *
 * Worksheet structure is preserved as markdown in `notes.body_md`. The
 * therapist reading the printed PDF gets a plain, chronological document —
 * no aestheticisation, no JSON, no app-specific affordances.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const NOTES_TABLE = 'notes';
export const CHECKINS_TABLE = 'checkins';
export const PREP_LISTS_TABLE = 'prep_lists';

export type NoteKind = 'free' | 'thought-record' | 'values' | 'check-in';

export const notesSchema: LocalDbSchema = {
  id: 'text primary key',
  kind: 'text not null',
  title: 'text',
  body_md: 'text not null',
  occurred_at: 'datetime',
  created_at: 'datetime',
};

export interface Note {
  id: string;
  kind: NoteKind;
  title?: string | null;
  body_md: string;
  occurred_at: string;
  created_at: string;
}

export const checkinsSchema: LocalDbSchema = {
  id: 'text primary key',
  occurred_on: 'text not null',
  mood_1to5: 'integer',
  anxiety_1to5: 'integer',
  sleep_hours: 'real',
  note: 'text',
  created_at: 'datetime',
};

export interface Checkin {
  id: string;
  /** YYYY-MM-DD — one row per local day, but we don't enforce it. */
  occurred_on: string;
  mood_1to5?: number | null;
  anxiety_1to5?: number | null;
  sleep_hours?: number | null;
  note?: string | null;
  created_at: string;
}

export const prepListsSchema: LocalDbSchema = {
  id: 'text primary key',
  label: 'text',
  body_md: 'text not null',
  occurred_at: 'datetime',
};

export interface PrepList {
  id: string;
  label?: string | null;
  body_md: string;
  occurred_at: string;
}
