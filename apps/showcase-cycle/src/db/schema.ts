/**
 * Local-DB schema for Cycle.
 *
 * Three tables:
 *   - cycles: one row per menstrual cycle (started_on / ended_on).
 *   - days: one row per logged day inside a cycle (flow + symptoms + note).
 *   - prefs: a singleton row holding privacy + partner-share state.
 *
 * All data lives in wa-sqlite + OPFS via @shippie/local-db. Data stays
 * on the device unless the user explicitly opts in to partner sharing.
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
  // 5-second-log fields (cycle.v2). pain/mood/energy are small integer scales;
  // discharge is a cervical-fluid enum; meds/sex are JSON arrays. sex is the
  // most sensitive field — always optional, never required, never shared by
  // default. Stored locally only, like everything else.
  pain: 'integer',
  mood: 'integer',
  energy: 'integer',
  discharge: 'text',
  meds_json: 'text',
  sex_json: 'text',
  symptoms_json: 'text',
  note: 'text',
  created_at: 'datetime',
};

export const prefsSchema: LocalDbSchema = {
  id: 'text primary key',
  // Mode reframes the whole app (see MODES). Default 'period-only' — the most
  // inclusive, lowest-assumption starting point (no fertility framing).
  mode: 'text',
  gender_neutral: 'integer',
  // Privacy: optional on-device PIN lock + optional duress/decoy PIN (Euki-style).
  lock_pin: 'text',
  decoy_pin: 'text',
  share_with_partner: 'integer',
  partner_pair_code: 'text',
  partner_seen_fields_json: 'text',
  clinician_share_json: 'text',
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

// Symptom toggles. mood/energy/pain are dedicated scales (below) and sleep is
// consumed from a sibling app via the sleep-logged intent, so they're not
// toggles here. These cover the insight surfaces: headaches, digestion, acne,
// cravings, plus perimenopause-relevant signals (hot flushes, insomnia).
export const SYMPTOM_KEYS = [
  'cramps',
  'headache',
  'bloating',
  'nausea',
  'digestion',
  'cravings',
  'breast-tenderness',
  'backache',
  'acne',
  'insomnia',
  'dizziness',
  'hot-flush',
] as const;

export type SymptomKey = (typeof SYMPTOM_KEYS)[number];

export const SYMPTOM_LABELS: Record<SymptomKey, string> = {
  cramps: 'cramps',
  headache: 'headache',
  bloating: 'bloating',
  nausea: 'nausea',
  digestion: 'digestion',
  cravings: 'cravings',
  'breast-tenderness': 'breast tenderness',
  backache: 'backache',
  acne: 'skin / acne',
  insomnia: 'insomnia',
  dizziness: 'dizziness',
  'hot-flush': 'hot flush',
};

/** Pain scale: 0 none, 1 mild, 2 moderate, 3 severe. */
export type Pain = 0 | 1 | 2 | 3;
export const PAIN_LABELS: Record<Pain, string> = { 0: 'none', 1: 'mild', 2: 'moderate', 3: 'severe' };

/** Mood + energy are gentle 1–5 reads (1 low / rough → 5 high / good). */
export type Scale5 = 1 | 2 | 3 | 4 | 5;
export const MOOD_LABELS: Record<Scale5, string> = { 1: 'rough', 2: 'low', 3: 'okay', 4: 'good', 5: 'great' };
export const ENERGY_LABELS: Record<Scale5, string> = { 1: 'drained', 2: 'low', 3: 'steady', 4: 'good', 5: 'wired' };

/** Cervical fluid / discharge — factual, for fertility-aware + general literacy. */
export const DISCHARGE_OPTIONS = ['dry', 'sticky', 'creamy', 'eggwhite', 'watery', 'unusual'] as const;
export type Discharge = (typeof DISCHARGE_OPTIONS)[number];
export const DISCHARGE_LABELS: Record<Discharge, string> = {
  dry: 'dry',
  sticky: 'sticky',
  creamy: 'creamy',
  eggwhite: 'egg-white',
  watery: 'watery',
  unusual: 'unusual',
};

/** Optional intimacy field — the most sensitive; never required, never shared by default. */
export const SEX_OPTIONS = ['protected', 'unprotected', 'solo', 'other'] as const;
export type SexEntry = (typeof SEX_OPTIONS)[number];
export const SEX_LABELS: Record<SexEntry, string> = {
  protected: 'protected',
  unprotected: 'unprotected',
  solo: 'solo',
  other: 'other',
};

export interface Day {
  id: string;
  cycle_id: string;
  date: string;
  flow?: Flow | null;
  pain?: Pain | null;
  mood?: Scale5 | null;
  energy?: Scale5 | null;
  discharge?: Discharge | null;
  meds_json?: string | null;
  sex_json?: string | null;
  symptoms_json?: string | null;
  note?: string | null;
  created_at?: string;
}

// ── Modes ───────────────────────────────────────────────────────────────
// Mode reframes the whole app: which fields show, which predictions run, and
// how copy reads. Gender-neutral copy is a separate, orthogonal toggle.
export const MODES = [
  'period-only',
  'fertility-aware',
  'contraception',
  'ttc',
  'pregnancy',
  'postpartum',
  'perimenopause',
  'irregular',
] as const;
export type Mode = (typeof MODES)[number];

export interface ModeMeta {
  label: string;
  blurb: string;
  /** Show the fertile-window surface (ovulation/discharge fertility framing). */
  fertility: boolean;
  /** Run period predictions (off for pregnancy; soft/wide for perimenopause & irregular). */
  predict: boolean;
}

export const MODE_META: Record<Mode, ModeMeta> = {
  'period-only': { label: 'Period only', blurb: 'Just bleeding, symptoms, and predictions. No fertility framing.', fertility: false, predict: true },
  'fertility-aware': { label: 'Fertility-aware', blurb: 'Adds the fertile window and cervical-fluid notes.', fertility: true, predict: true },
  contraception: { label: 'On contraception', blurb: 'Tracks bleeding/symptoms; downplays fertility prediction.', fertility: false, predict: true },
  ttc: { label: 'Trying to conceive', blurb: 'Foregrounds the fertile window and intimacy notes.', fertility: true, predict: true },
  pregnancy: { label: 'Pregnant', blurb: 'Pauses cycle prediction; logs symptoms and notes.', fertility: false, predict: false },
  postpartum: { label: 'Postpartum', blurb: 'Cycles may be irregular or absent while they return.', fertility: false, predict: false },
  perimenopause: { label: 'Perimenopause', blurb: 'Expects variability; widens prediction ranges, adds hot-flush/sleep signals.', fertility: false, predict: true },
  irregular: { label: 'Irregular / no set cycle', blurb: 'No assumptions about regularity; predictions stay wide and clearly uncertain.', fertility: false, predict: true },
};

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

/** A field-selective, revocable clinician/export share bundle (offline-safe). */
export interface ClinicianShare {
  include_cycles: boolean;
  include_symptoms: boolean;
  include_flow: boolean;
  include_notes: boolean;
  include_intimacy: boolean;
  from_date: string | null;
}

export const DEFAULT_CLINICIAN_SHARE: ClinicianShare = {
  include_cycles: true,
  include_symptoms: true,
  include_flow: true,
  include_notes: false,
  include_intimacy: false,
  from_date: null,
};

export interface Prefs {
  id: string;
  mode?: string | null;
  gender_neutral?: number | null;
  lock_pin?: string | null;
  decoy_pin?: string | null;
  share_with_partner?: number | null;
  partner_pair_code?: string | null;
  partner_seen_fields_json?: string | null;
  clinician_share_json?: string | null;
}

export interface PrefsView {
  mode: Mode;
  gender_neutral: boolean;
  lock_pin: string | null;
  decoy_pin: string | null;
  share_with_partner: boolean;
  partner_pair_code: string | null;
  partner_seen_fields: PartnerSeenFields;
  clinician_share: ClinicianShare;
}
