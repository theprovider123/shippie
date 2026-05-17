/**
 * Local-DB schema for Symptom Diary.
 *
 * Four tables:
 *   - symptoms      — the user-editable list of symptoms they track
 *   - entries       — individual symptom logs (intensity + note + trigger)
 *   - medications   — active meds + free-text schedule
 *   - med_doses     — individual "took a dose" timestamps
 *
 * Everything lives in wa-sqlite + OPFS via @shippie/local-db. Nothing
 * leaves the device. Export is user-controlled (browser-native print).
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const SYMPTOMS_TABLE = 'symptoms';
export const ENTRIES_TABLE = 'entries';
export const MEDICATIONS_TABLE = 'medications';
export const MED_DOSES_TABLE = 'med_doses';

export type SymptomScale = '1-5' | 'present-absent';

export const symptomsSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  default_scale: 'text not null',
  sort_order: 'integer',
  created_at: 'datetime',
};

export const entriesSchema: LocalDbSchema = {
  id: 'text primary key',
  occurred_at: 'datetime',
  symptom_id: 'text not null',
  intensity: 'integer',
  note: 'text',
  trigger_text: 'text',
};

export const medicationsSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  dose: 'text',
  schedule_text: 'text',
  active: 'integer',
  created_at: 'datetime',
};

export const medDosesSchema: LocalDbSchema = {
  id: 'text primary key',
  medication_id: 'text not null',
  taken_at: 'datetime',
  note: 'text',
};

export interface Symptom {
  id: string;
  name: string;
  default_scale: SymptomScale;
  sort_order?: number | null;
  created_at?: string;
}

export interface Entry {
  id: string;
  occurred_at: string;
  symptom_id: string;
  /**
   * For 1-5 scale: 1..5. For present-absent: 1 = present, 0 = absent.
   * Stored as integer; the UI components decide what to render.
   */
  intensity: number;
  note?: string | null;
  trigger_text?: string | null;
}

export interface Medication {
  id: string;
  name: string;
  dose?: string | null;
  schedule_text?: string | null;
  /** 1 = active, 0 = archived. Integer because SQLite has no bool. */
  active: number;
  created_at?: string;
}

export interface MedDose {
  id: string;
  medication_id: string;
  taken_at: string;
  note?: string | null;
}
