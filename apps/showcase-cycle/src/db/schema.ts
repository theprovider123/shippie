/**
 * Local-DB schema for Cycle.
 *
 * Three tables:
 *   - cycles: one row per menstrual cycle (started_on / ended_on).
 *   - days: one row per logged day inside a cycle (flow + symptoms + note).
 *   - prefs: a singleton row holding privacy + partner-share state.
 *
 * All data lives in wa-sqlite + OPFS via @shippie/local-db. Nothing leaves
 * the device unless the user explicitly opts in to partner sharing.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const CYCLES_TABLE = 'cycles';
export const DAYS_TABLE = 'days';
export const PREFS_TABLE = 'prefs';
export const PREFS_SINGLETON_ID = 'singleton';

export const cyclesSchema: LocalDbSchema = {
  id: 'text primary key',
  started_on: 'text not null',
  ended_on: 'text',
  length_days: 'integer',
  notes: 'text',
  created_at: 'datetime',
};

export const daysSchema: LocalDbSchema = {
  id: 'text primary key',
  cycle_id: 'text not null',
  date: 'text not null',
  flow: 'integer',
  symptoms_json: 'text',
  note: 'text',
  created_at: 'datetime',
};

export const prefsSchema: LocalDbSchema = {
  id: 'text primary key',
  share_with_partner: 'integer',
  partner_pair_code: 'text',
  partner_seen_fields_json: 'text',
};

export interface Cycle {
  id: string;
  started_on: string;
  ended_on?: string | null;
  length_days?: number | null;
  notes?: string | null;
  created_at?: string;
}

/** Flow scale: 0 none, 1 spotting, 2 light, 3 medium, 4 heavy. */
export type Flow = 0 | 1 | 2 | 3 | 4;

export const FLOW_LABELS: Record<Flow, string> = {
  0: 'none',
  1: 'spotting',
  2: 'light',
  3: 'medium',
  4: 'heavy',
};

export const SYMPTOM_KEYS = [
  'cramps',
  'bloating',
  'mood',
  'sleep',
  'headache',
  'breast-tenderness',
  'fatigue',
  'acne',
] as const;

export type SymptomKey = (typeof SYMPTOM_KEYS)[number];

export interface Day {
  id: string;
  cycle_id: string;
  date: string;
  flow?: Flow | null;
  symptoms_json?: string | null;
  note?: string | null;
  created_at?: string;
}

/** Which fields a partner is allowed to see. Off by default. */
export interface PartnerSeenFields {
  cycle_day: boolean;
  fertile_window: boolean;
  predicted_period: boolean;
  flow_today: boolean;
}

export const DEFAULT_PARTNER_SEEN: PartnerSeenFields = {
  cycle_day: true,
  fertile_window: false,
  predicted_period: false,
  flow_today: false,
};

export interface Prefs {
  id: string;
  share_with_partner?: number | null;
  partner_pair_code?: string | null;
  partner_seen_fields_json?: string | null;
}

export interface PrefsView {
  share_with_partner: boolean;
  partner_pair_code: string | null;
  partner_seen_fields: PartnerSeenFields;
}
