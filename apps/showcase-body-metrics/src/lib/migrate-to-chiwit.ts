/**
 * Body Metrics → Chiwit migration.
 *
 * Body Metrics is being absorbed by Chiwit (`successor: chiwit` in
 * shippie.json). This helper copies the local weight history into the
 * shape Chiwit's localStorage expects, without touching photos —
 * Chiwit isn't a photo-progress app.
 *
 * The merge is idempotent on (date, weightKg): if Chiwit already has
 * a `weight` entry for the same date with the same value, we skip it.
 * Body Metrics' own data is left alone so the user can wipe it
 * explicitly via the existing Erase action.
 */
import type { Entry } from './store.ts';

const CHIWIT_KEY = 'shippie.chiwit.daily-pulse.v1';

interface ChiwitPulseEntry {
  id: string;
  kind: 'weight' | 'mood' | 'energy' | 'sleep' | 'hydration' | 'movement' | 'mindful' | 'body';
  date: string;
  value: number;
  amount?: number;
  unit?: string;
  note?: string;
  createdAt: number;
}

interface ChiwitState {
  entries: ChiwitPulseEntry[];
  checkins: unknown[];
  dismissedInsightIds: string[];
  goals: { waterMl: number; sleepHours: number; movementMin: number; mindfulMin: number };
}

function emptyChiwitState(): ChiwitState {
  return {
    entries: [],
    checkins: [],
    dismissedInsightIds: [],
    goals: { waterMl: 2000, sleepHours: 8, movementMin: 30, mindfulMin: 10 },
  };
}

function readChiwit(): ChiwitState {
  try {
    const raw = localStorage.getItem(CHIWIT_KEY);
    if (!raw) return emptyChiwitState();
    const parsed = JSON.parse(raw) as Partial<ChiwitState>;
    return {
      ...emptyChiwitState(),
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries as ChiwitPulseEntry[] : [],
      checkins: Array.isArray(parsed.checkins) ? parsed.checkins : [],
      dismissedInsightIds: Array.isArray(parsed.dismissedInsightIds) ? parsed.dismissedInsightIds : [],
      goals: { ...emptyChiwitState().goals, ...(parsed.goals ?? {}) },
    };
  } catch {
    return emptyChiwitState();
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `entry_${crypto.randomUUID()}`;
  }
  return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Returns the number of newly-added entries. Existing same-date,
 * same-weight rows are skipped so the migration can be re-run safely.
 */
export function migrateEntriesToChiwit(entries: readonly Entry[]): number {
  const state = readChiwit();
  const existing = new Set(
    state.entries
      .filter((e) => e.kind === 'weight')
      .map((e) => `${e.date}|${e.amount ?? e.value}`),
  );
  let added = 0;
  const newEntries: ChiwitPulseEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.date}|${entry.weightKg}`;
    if (existing.has(key)) continue;
    newEntries.push({
      id: newId(),
      kind: 'weight',
      date: entry.date,
      value: entry.weightKg,
      amount: entry.weightKg,
      unit: 'kg',
      note: entry.note,
      // Body Metrics entries don't carry createdAt; use date noon as
      // a stable timestamp so the Chiwit timeline orders sensibly.
      createdAt: new Date(`${entry.date}T12:00:00`).getTime(),
    });
    added += 1;
  }
  const merged: ChiwitState = {
    ...state,
    entries: [...newEntries, ...state.entries].slice(0, 1000),
  };
  localStorage.setItem(CHIWIT_KEY, JSON.stringify(merged));
  return added;
}
