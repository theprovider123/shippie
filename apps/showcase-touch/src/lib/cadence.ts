/**
 * Cadence profiles — how often you'd ideally touch base with someone.
 *
 * These aren't business rules; they're the gentle nudges a paper Rolodex
 * could never give you. Inner-circle: monthly. Warm: every two months.
 * Occasional: every six. Pick a per-person override (or none) and the
 * `next-touch` math will surface the right names at the right time.
 */
export type CadenceKey = 'inner' | 'warm' | 'occasional' | 'dormant';

export interface Cadence {
  key: CadenceKey;
  label: string;
  /** Days between expected touches. */
  days: number;
  /** Short description for UI tooltips. */
  hint: string;
}

export const CADENCES: ReadonlyArray<Cadence> = [
  {
    key: 'inner',
    label: 'Inner circle',
    days: 30,
    hint: 'monthly — the people you genuinely talk to',
  },
  {
    key: 'warm',
    label: 'Warm',
    days: 60,
    hint: 'every couple of months — past clients, advisors',
  },
  {
    key: 'occasional',
    label: 'Occasional',
    days: 180,
    hint: 'twice a year — friends-in-the-industry catch-ups',
  },
  {
    key: 'dormant',
    label: 'Dormant',
    days: 365,
    hint: "once a year just so you don't lose touch",
  },
];

export const DEFAULT_CADENCE_DAYS = 60;

const KEYS_BY_DAYS: ReadonlyArray<{ max: number; key: CadenceKey }> = [
  { max: 30, key: 'inner' },
  { max: 60, key: 'warm' },
  { max: 180, key: 'occasional' },
  { max: Number.POSITIVE_INFINITY, key: 'dormant' },
];

export function cadenceForDays(days: number): Cadence {
  const target = Math.max(1, Math.round(days));
  for (const entry of KEYS_BY_DAYS) {
    if (target <= entry.max) {
      return CADENCES.find((c) => c.key === entry.key) as Cadence;
    }
  }
  return CADENCES[CADENCES.length - 1] as Cadence;
}

export function cadenceByKey(key: CadenceKey): Cadence {
  const found = CADENCES.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown cadence key: ${key}`);
  return found;
}

/** Resolve effective cadence days for a person, falling back to default. */
export function effectiveCadenceDays(personCadenceDays: number | null | undefined): number {
  if (personCadenceDays && personCadenceDays > 0) return personCadenceDays;
  return DEFAULT_CADENCE_DAYS;
}
