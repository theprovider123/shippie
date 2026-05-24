import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { createShippieIframeSdk, type IntentBroadcast } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import {
  BackupCard,
  EmptyState,
  IntentToastHost,
  KeepsakeRenderer,
  QrShareSheet,
  encodeShareFragment,
  type IntentLike,
  type IntentSubscription,
} from '@shippie/showcase-kit-v2';
import { AMBIENT_BY_KIND, MATCHED_KINDS, MATCHERS, type AmbientSignalKind } from './IntentMatchers';
import { WeeklyShape, buildWeekShape, isoWeekCode, type WeekDay, type WeekShapeData } from './WeeklyShape';
import { createChiwitBackupStore } from './backup-store';

type Tab = 'today' | 'track' | 'patterns' | 'timeline' | 'data';
type EntryKind = 'mood' | 'energy' | 'sleep' | 'hydration' | 'movement' | 'mindful' | 'body' | 'weight';
type CheckinWindow = 'morning' | 'afternoon' | 'evening';

interface PulseEntry {
  id: string;
  kind: EntryKind;
  date: string;
  value: number;
  amount?: number;
  unit?: string;
  note?: string;
  createdAt: number;
  /** When set, this signal was folded in from a sibling Shippie app. */
  source?: string;          // e.g. "app_coffee", "app_lift"
  sourceIcon?: string;      // emoji glyph for the Today badge
}

interface Checkin {
  id: string;
  date: string;
  window: CheckinWindow;
  mood: number;
  energy: number;
  body: number;
  note?: string;
  createdAt: number;
}

interface ChiwitState {
  entries: PulseEntry[];
  checkins: Checkin[];
  dismissedInsightIds: string[];
  goals: {
    waterMl: number;
    sleepHours: number;
    movementMin: number;
    mindfulMin: number;
  };
}

interface ScoreBreakdown {
  foundations: number;
  recovery: number;
  movement: number;
  mind: number;
  body: number;
}

/** Which factors were computed from real logged data vs. left un-logged. */
type FactorLogged = Record<keyof ScoreBreakdown, boolean>;

interface PulseScore {
  /** Overall 0-100 pulse, or null when fewer than 3 signals exist (shown as "—"). */
  overall: number | null;
  breakdown: ScoreBreakdown;
  /** True for each factor that has at least one logged signal behind it. */
  logged: FactorLogged;
  /** Count of factors with logged data — drives the "—" honesty gate. */
  loggedCount: number;
  /** Total raw signals (entries + check-ins) for the day/window. */
  signalCount: number;
  message: string;
}

/**
 * Calm-baseline placeholder for un-logged factor bars. Picked at 45 (not
 * 50) so the bar visibly *isn't* "average" — it leans low without looking
 * defaulted. Bars at this value are styled as ghost dashes
 * (see `.pulse-factors span.is-unlogged i`) so the user can read at a
 * glance that there's no signal behind them. Never feeds the overall
 * pulse — see the honesty gate in `computePulse`.
 */
const UNLOGGED_FACTOR_VALUE = 45;

interface QuickAction {
  kind: EntryKind;
  label: string;
  helper: string;            // small one-line helper shown under the strong label
  value: number;
  amount?: number;
  unit?: string;
  note?: string;
}

interface Insight {
  id: string;
  title: string;
  body: string;
  tone: 'good' | 'watch' | 'neutral';
}

const shippie = createShippieIframeSdk({ appId: 'app_chiwit' });
const STORAGE_KEY = 'shippie.chiwit.daily-pulse.v1';
const QUICK_ACTIONS_STORAGE_KEY = 'CUSTOM_QUICK_ACTIONS';
const CHIWIT_LOGO_URL = `${import.meta.env.BASE_URL}brand/chiwit-logo.png`;
const backupStore = createChiwitBackupStore();

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'track', label: 'Log' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'data', label: 'Data' },
];

/**
 * Per-kind metadata. `color` resolves through a CSS variable so the
 * Chiwit theme owns the palette — change `--kind-mood` etc. in
 * styles.css to retint every dot/pill/entry-marker. The hex fallbacks
 * inside the var() keep the visual identical when the page hasn't
 * loaded styles.css yet (FOUC) or the var is unset under a sub-theme.
 */
const KIND_META: Record<EntryKind, { label: string; color: string; unit: string; helper: string }> = {
  mood:      { label: 'Mood',         color: 'var(--kind-mood, #F97066)',      unit: '/5',  helper: 'Mind factor' },
  energy:    { label: 'Energy',       color: 'var(--kind-energy, #FF9800)',    unit: '/5',  helper: 'Mind factor' },
  sleep:     { label: 'Sleep',        color: 'var(--kind-sleep, #9575CD)',     unit: 'h',   helper: 'Recovery factor' },
  hydration: { label: 'Hydration',    color: 'var(--kind-hydration, #42A5F5)', unit: 'ml',  helper: 'Foundations factor' },
  movement:  { label: 'Movement',     color: 'var(--kind-movement, #66BB6A)',  unit: 'min', helper: 'Movement factor' },
  mindful:   { label: 'Mindful',      color: 'var(--kind-mindful, #26A69A)',   unit: 'min', helper: 'Recovery factor' },
  body:      { label: 'Body',         color: 'var(--kind-body, #8D6E63)',      unit: '/5',  helper: 'Body factor' },
  weight:    { label: 'Body metrics', color: 'var(--kind-weight, #A5D6A7)',    unit: 'kg',  helper: 'Body factor' },
};

const FACTOR_HELPER_TEXT: Record<keyof ScoreBreakdown, string> = {
  foundations: 'Foundations = hydration + meals',
  recovery:    'Recovery = sleep + mindful',
  movement:    'Movement = walks + workouts',
  mind:        'Mind = mood + energy',
  body:        'Body = check-in body + symptoms',
};

const QUICK_ACTIONS: QuickAction[] = [
  { kind: 'hydration', label: 'Hydration · +250 ml', helper: 'Foundations',           value: 1, amount: 250, unit: 'ml',  note: 'water' },
  { kind: 'mood',      label: 'Mood · good',         helper: 'Mind · 4/5',            value: 4, note: 'steady' },
  { kind: 'energy',    label: 'Energy · okay',       helper: 'Mind · 3/5',            value: 3, note: 'steady' },
  { kind: 'sleep',     label: 'Sleep · 7.5 h',       helper: 'Recovery',              value: 4, amount: 7.5, unit: 'h' },
  { kind: 'movement',  label: 'Movement · 20 min',   helper: 'A short walk counts',   value: 3, amount: 20, unit: 'min' },
  { kind: 'mindful',   label: 'Mindful · 5 min',     helper: 'Recovery · breath',     value: 4, amount: 5, unit: 'min' },
  { kind: 'body',      label: 'Body · okay',         helper: 'Body · 3/5',            value: 3, note: 'okay' },
];

/**
 * Persisted quick-action customization. Each entry references a default
 * action by (kind + amount + unit) signature with an optional `hidden`
 * flag, OR describes a fully-custom user-created action (`custom: true`).
 *
 * Stored under localStorage key `CUSTOM_QUICK_ACTIONS` as an ordered list.
 * When the user has never customised, the list is empty and the active
 * grid falls back to `QUICK_ACTIONS` verbatim.
 */
interface CustomQuickAction {
  kind: EntryKind;
  amount?: number;
  unit?: string;
  label?: string;
  /** When true, this default action is suppressed from the active grid. */
  hidden?: boolean;
  /** Marks an entirely user-created action (so the Customize pane offers remove). */
  custom?: boolean;
}

/** Stable signature so customisations re-bind to default actions across reorders. */
function quickActionSignature(action: Pick<QuickAction, 'kind' | 'amount' | 'unit'>): string {
  return `${action.kind}|${action.amount ?? ''}|${action.unit ?? ''}`;
}

function readCustomQuickActions(): CustomQuickAction[] {
  try {
    const raw = localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is CustomQuickAction => {
      return typeof row === 'object' && row !== null && 'kind' in row && typeof (row as { kind: unknown }).kind === 'string';
    });
  } catch {
    return [];
  }
}

function writeCustomQuickActions(rows: CustomQuickAction[]): void {
  try {
    localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* localStorage may be full or unavailable — silently no-op. */
  }
}

/**
 * Merge default `QUICK_ACTIONS` with the user's customisation list.
 *
 * Resolution rules:
 *   - An empty customisation list yields the defaults verbatim.
 *   - A non-empty list defines the *order*; defaults missing from the list
 *     get appended (so newly-shipped defaults appear even when a saved
 *     customisation exists).
 *   - Entries with `hidden: true` are filtered out of the active grid.
 *   - Entries with `custom: true` are user-created (no default to match).
 */
function mergeQuickActions(custom: CustomQuickAction[]): QuickAction[] {
  if (custom.length === 0) return QUICK_ACTIONS;
  const defaultsBySig = new Map(QUICK_ACTIONS.map((action) => [quickActionSignature(action), action]));
  const seen = new Set<string>();
  const merged: QuickAction[] = [];

  for (const row of custom) {
    if (row.hidden) {
      if (!row.custom) seen.add(quickActionSignature(row));
      continue;
    }
    if (row.custom) {
      merged.push({
        kind: row.kind,
        label: row.label ?? `${KIND_META[row.kind].label} · custom`,
        helper: KIND_META[row.kind].helper,
        value: 3,
        amount: row.amount,
        unit: row.unit ?? (row.amount !== undefined ? KIND_META[row.kind].unit : undefined),
      });
      continue;
    }
    const sig = quickActionSignature(row);
    const base = defaultsBySig.get(sig);
    if (!base) continue;
    merged.push({ ...base, label: row.label ?? base.label });
    seen.add(sig);
  }

  for (const action of QUICK_ACTIONS) {
    const sig = quickActionSignature(action);
    if (!seen.has(sig) && !custom.some((row) => !row.custom && quickActionSignature(row) === sig)) {
      merged.push(action);
    }
  }

  return merged;
}

function id(prefix: string): string {
  if ('randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Time-of-day greeting for the Today hero. Morning < 12, afternoon < 18,
 * evening otherwise. Keeps "How are you" cadence so micro-copy lands in
 * the same key as the rest of the page.
 */
function timeAwareGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning — how is it landing?';
  if (h < 18) return 'Good afternoon — how is it going?';
  return 'Good evening — how did today land?';
}

function addDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function emptyState(): ChiwitState {
  const now = Date.now();
  const d0 = today();
  return {
    entries: [
      { id: id('entry'), kind: 'sleep', date: d0, value: 4, amount: 7.5, unit: 'h', createdAt: now - 1000 * 60 * 60 * 7 },
      { id: id('entry'), kind: 'hydration', date: d0, value: 1, amount: 500, unit: 'ml', createdAt: now - 1000 * 60 * 60 * 3 },
      { id: id('entry'), kind: 'mood', date: d0, value: 4, note: 'calm', createdAt: now - 1000 * 60 * 45 },
      { id: id('entry'), kind: 'movement', date: addDays(-1), value: 4, amount: 35, unit: 'min', createdAt: now - 1000 * 60 * 60 * 25 },
      { id: id('entry'), kind: 'energy', date: addDays(-1), value: 3, note: 'afternoon dip', createdAt: now - 1000 * 60 * 60 * 23 },
    ],
    checkins: [],
    dismissedInsightIds: [],
    goals: {
      waterMl: 2000,
      sleepHours: 8,
      movementMin: 30,
      mindfulMin: 10,
    },
  };
}

function readState(): ChiwitState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<ChiwitState>;
    return {
      ...emptyState(),
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      checkins: Array.isArray(parsed.checkins) ? parsed.checkins : [],
      dismissedInsightIds: Array.isArray(parsed.dismissedInsightIds) ? parsed.dismissedInsightIds : [],
      goals: { ...emptyState().goals, ...(parsed.goals ?? {}) },
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: ChiwitState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function entriesForDate(entries: PulseEntry[], date: string): PulseEntry[] {
  return entries.filter((entry) => entry.date === date);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function scoreForKind(kind: EntryKind, entries: PulseEntry[], state: ChiwitState): number | null {
  const matching = entries.filter((entry) => entry.kind === kind);
  if (matching.length === 0) return null;
  if (kind === 'hydration') {
    const total = matching.reduce((sum, entry) => sum + (entry.amount ?? 250), 0);
    return clamp(Math.round((total / state.goals.waterMl) * 100));
  }
  if (kind === 'sleep') {
    const hours = average(matching.map((entry) => entry.amount ?? entry.value));
    return hours === null ? null : clamp(Math.round((hours / state.goals.sleepHours) * 100));
  }
  if (kind === 'movement') {
    const minutes = matching.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
    return clamp(Math.round((minutes / state.goals.movementMin) * 100));
  }
  if (kind === 'mindful') {
    const minutes = matching.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
    return clamp(Math.round((minutes / state.goals.mindfulMin) * 100));
  }
  const avg = average(matching.map((entry) => entry.value));
  return avg === null ? null : clamp(Math.round((avg / 5) * 100));
}

const FACTOR_NAMES: Record<keyof ScoreBreakdown, string> = {
  foundations: 'Foundations',
  recovery: 'Recovery',
  movement: 'Movement',
  mind: 'Mind',
  body: 'Body',
};

/**
 * Consistency = share of the last 7 days with ≥ 3 logged signals.
 */
function consistencyPct(state: ChiwitState): number {
  const days = Array.from({ length: 7 }, (_, index) => addDays(-index));
  const goodDays = days.filter((d) => entriesForDate(state.entries, d).length >= 3).length;
  return Math.round((goodDays / 7) * 100);
}

function generateReading(state: ChiwitState, pulse: PulseScore, when: string = today()): string {
  const sentences: string[] = [];
  sentences.push(
    pulse.overall === null ? 'The day is still gathering signals.' :
    pulse.overall >= 80 ? 'Life feels open today.' :
    pulse.overall >= 62 ? 'A steady day is forming.' :
    pulse.overall >= 45 ? 'Gentle attention helps today.' :
    'Keep the bar kind and small.',
  );

  // Only reason about factors that were actually logged — an un-logged
  // factor sitting at the baseline must not be called a "soft spot".
  const sorted = (Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>)
    .filter(([key]) => pulse.logged[key])
    .sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const dayEntries = entriesForDate(state.entries, when);
  const externalToday = dayEntries.filter((entry) => entry.source && entry.source.startsWith('app_'));

  if (top && top[1] >= 72 && bottom && bottom[1] < 50 && top[0] !== bottom[0]) {
    sentences.push(`${FACTOR_NAMES[top[0]]} is leading at ${top[1]}; ${FACTOR_NAMES[bottom[0]].toLowerCase()} is the soft spot — a small move shifts the score.`);
  } else if (top && top[1] >= 72) {
    sentences.push(`${FACTOR_NAMES[top[0]]} is leading at ${top[1]} today.`);
  } else if (bottom && bottom[1] < 50) {
    sentences.push(`${FACTOR_NAMES[bottom[0]]} is the soft spot — a small move there shifts the whole reading.`);
  } else if (externalToday.length > 0) {
    sentences.push(`${externalToday.length} signal${externalToday.length === 1 ? '' : 's'} folded in from your other apps so far.`);
  } else if (dayEntries.length === 0) {
    sentences.push('No signals yet — log one when you notice it, not by the clock.');
  } else {
    // Surface which factors are already in so the user knows what to log next.
    const loggedFactors = (Object.keys(pulse.logged) as Array<keyof ScoreBreakdown>)
      .filter((key) => pulse.logged[key])
      .map((key) => FACTOR_NAMES[key].toLowerCase());
    const tail = loggedFactors.length > 0
      ? ` So far: ${loggedFactors.join(', ')}.`
      : '';
    sentences.push(`${dayEntries.length} signal${dayEntries.length === 1 ? '' : 's'} logged so far.${tail}`);
  }

  return sentences.join(' ');
}

/**
 * Compute the Daily Pulse honestly.
 *
 * Each of the five factors is only "logged" when at least one real signal
 * sits behind it. Un-logged factors render at a calm baseline
 * (`UNLOGGED_FACTOR_VALUE`) so the bar UI has something to draw, but they
 * are excluded from the overall pulse — that number is the average of the
 * *logged* factors only.
 *
 * If fewer than three factors are logged, the overall pulse is `null` and
 * the UI shows "—" rather than a precise-looking number invented from
 * defaulted factors.
 */
function computePulse(state: ChiwitState, date = today()): PulseScore {
  const dayEntries = entriesForDate(state.entries, date);
  const dayCheckins = state.checkins.filter((checkin) => checkin.date === date);
  const checkinMood = average(dayCheckins.map((checkin) => checkin.mood));
  const checkinEnergy = average(dayCheckins.map((checkin) => checkin.energy));
  const checkinBody = average(dayCheckins.map((checkin) => checkin.body));

  const hydration = scoreForKind('hydration', dayEntries, state);
  const sleep = scoreForKind('sleep', dayEntries, state);
  const movement = scoreForKind('movement', dayEntries, state);
  const mindful = scoreForKind('mindful', dayEntries, state);
  const mood = scoreForKind('mood', dayEntries, state) ?? (checkinMood === null ? null : Math.round((checkinMood / 5) * 100));
  const energy = scoreForKind('energy', dayEntries, state) ?? (checkinEnergy === null ? null : Math.round((checkinEnergy / 5) * 100));
  const body = scoreForKind('body', dayEntries, state) ?? (checkinBody === null ? null : Math.round((checkinBody / 5) * 100));

  // Each factor reduces to a value-or-null; null means "not yet logged".
  const foundationsRaw = average([hydration].filter((value): value is number => value !== null));
  const recoveryRaw = average([sleep, mindful].filter((value): value is number => value !== null));
  const moveRaw = movement;
  const mindRaw = average([mood, energy].filter((value): value is number => value !== null));
  const bodyRaw = body;

  const logged: FactorLogged = {
    foundations: foundationsRaw !== null,
    recovery: recoveryRaw !== null,
    movement: moveRaw !== null,
    mind: mindRaw !== null,
    body: bodyRaw !== null,
  };

  // Un-logged factors render at the calm baseline so bars have a value,
  // but they never feed the overall pulse — see `loggedValues` below.
  const breakdown: ScoreBreakdown = {
    foundations: Math.round(foundationsRaw ?? UNLOGGED_FACTOR_VALUE),
    recovery: Math.round(recoveryRaw ?? UNLOGGED_FACTOR_VALUE),
    movement: Math.round(moveRaw ?? UNLOGGED_FACTOR_VALUE),
    mind: Math.round(mindRaw ?? UNLOGGED_FACTOR_VALUE),
    body: Math.round(bodyRaw ?? UNLOGGED_FACTOR_VALUE),
  };

  const loggedCount = Object.values(logged).filter(Boolean).length;
  const loggedValues = (Object.keys(logged) as Array<keyof ScoreBreakdown>)
    .filter((key) => logged[key])
    .map((key) => breakdown[key]);

  // Honesty gate: fewer than 3 logged factors → no precise number.
  const overall = loggedCount >= 3
    ? Math.round(average(loggedValues) ?? UNLOGGED_FACTOR_VALUE)
    : null;

  const signalCount = dayEntries.length + dayCheckins.length;

  return {
    overall,
    breakdown,
    logged,
    loggedCount,
    signalCount,
    message:
      overall === null ? 'Log a few signals and the day takes shape.' :
      overall >= 80 ? 'Life feels open today.' :
      overall >= 62 ? 'A steady day is forming.' :
      overall >= 45 ? 'Gentle attention helps today.' :
      'Keep the bar kind and small.',
  };
}

function makeEntry(action: QuickAction, date = today()): PulseEntry {
  return {
    id: id('entry'),
    kind: action.kind,
    date,
    value: action.value,
    amount: action.amount,
    unit: action.unit,
    note: action.note,
    createdAt: Date.now(),
  };
}

function broadcastEntry(entry: PulseEntry): void {
  const loggedAt = new Date(entry.createdAt).toISOString();
  if (entry.kind === 'mood') {
    shippie.intent.broadcast('mood-logged', [{ score: entry.value, note: entry.note, logged_at: loggedAt }]);
  } else if (entry.kind === 'sleep') {
    shippie.intent.broadcast('sleep-logged', [{ hours: entry.amount ?? entry.value, quality: entry.value, logged_at: loggedAt }]);
  } else if (entry.kind === 'hydration') {
    shippie.intent.broadcast('hydration-logged', [{ amountMl: entry.amount ?? 250, logged_at: loggedAt }]);
  } else if (entry.kind === 'movement') {
    shippie.intent.broadcast('workout-completed', [{ durationMin: entry.amount ?? 0, intensity: entry.value, logged_at: loggedAt }]);
  } else if (entry.kind === 'mindful') {
    shippie.intent.broadcast('mindful-session', [{ duration_seconds: Math.round((entry.amount ?? 0) * 60), completed_at: loggedAt }]);
  } else if (entry.kind === 'body') {
    shippie.intent.broadcast('symptom-logged', [{ intensity: entry.value, note: entry.note, occurred_at: loggedAt }]);
  } else if (entry.kind === 'weight') {
    shippie.intent.broadcast('body-metrics-logged', [{ weightKg: entry.amount ?? entry.value, loggedAt }]);
  }
}

/**
 * Walk backwards from today and count consecutive days with ≥ 3 logged
 * signals. A "streak" is the number of unbroken consistency-quality days
 * leading up to (and including) today. Returns 0 when today is empty —
 * "consistency is your edge" only lands if the user's actually consistent.
 */
function consistencyStreak(state: ChiwitState): number {
  let streak = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const date = addDays(-offset);
    if (entriesForDate(state.entries, date).length >= 3) streak += 1;
    else break;
  }
  return streak;
}

function generateInsights(state: ChiwitState): Insight[] {
  const insights: Insight[] = [];
  const last7 = Array.from({ length: 7 }, (_, index) => addDays(-index));
  // Shared per-day lookup: cuts O(N × 7) entry scans down to O(N + 7).
  const last7Entries = last7.map((date) => entriesForDate(state.entries, date));
  const hydrationDays = last7Entries.map((rows) => rows.filter((entry) => entry.kind === 'hydration').reduce((sum, entry) => sum + (entry.amount ?? 0), 0));
  const movementDays = last7Entries.map((rows) => rows.filter((entry) => entry.kind === 'movement').reduce((sum, entry) => sum + (entry.amount ?? 0), 0));
  const moodDays = last7Entries.map((rows) => average(rows.filter((entry) => entry.kind === 'mood').map((entry) => entry.value)));
  const energyDays = last7Entries.map((rows) => average(rows.filter((entry) => entry.kind === 'energy').map((entry) => entry.value)));

  const streak = consistencyStreak(state);
  if (streak >= 3) {
    insights.push({
      id: `streak-${streak}`,
      title: `${streak}-day streak`,
      body: streak >= 7
        ? `${streak} unbroken days with 3+ signals — consistency is your edge.`
        : `${streak} days in a row with 3+ signals. Steady wins.`,
      tone: 'good',
    });
  }

  const hydrationAverage = average(hydrationDays);
  if (hydrationAverage !== null && hydrationAverage < state.goals.waterMl * 0.55) {
    insights.push({
      id: 'hydration-low',
      title: 'Hydration is the softest lever',
      body: `Your 7-day water average is ${Math.round(hydrationAverage)} ml. A small glass earlier in the day may lift the whole score.`,
      tone: 'watch',
    });
  }

  const movementAverage = average(movementDays);
  if (movementAverage !== null && movementAverage >= state.goals.movementMin * 0.8) {
    insights.push({
      id: 'movement-steady',
      title: 'Movement has been steady',
      body: `You are averaging ${Math.round(movementAverage)} minutes across recent logged days.`,
      tone: 'good',
    });
  }

  const paired = moodDays
    .map((mood, index) => ({ mood, energy: energyDays[index] }))
    .filter((row): row is { mood: number; energy: number } => row.mood !== null && row.energy !== null);
  if (paired.length >= 3) {
    const moodAvg = average(paired.map((row) => row.mood)) ?? 0;
    const energyAvg = average(paired.map((row) => row.energy)) ?? 0;
    insights.push({
      id: 'mood-energy',
      title: 'Mood and energy are moving together',
      body: `Recent mood averages ${moodAvg.toFixed(1)}/5 and energy averages ${energyAvg.toFixed(1)}/5 on days where both are logged.`,
      tone: 'neutral',
    });
  }

  if (state.checkins.length < 3) {
    insights.push({
      id: 'checkin-seed',
      title: 'Wisdom needs a few gentle notes',
      body: 'Three check-ins are enough for Chiwit to start showing rhythm instead of isolated numbers.',
      tone: 'neutral',
    });
  }

  // Cross-app timing correlation — for any pair of intent-kinds A, B, if
  // they've both been logged within 90 min of each other on ≥ 3 days in the
  // last 14, surface a "X + Y · typically N min apart" note. Ranked by day-
  // frequency; one per pair max. Neutral tone — it's a noticing, not a nudge.
  insights.push(...correlationInsights(state));

  return insights.filter((insight) => !state.dismissedInsightIds.includes(insight.id));
}

/**
 * Pair-wise temporal correlation across logged signals, including the
 * ambient signals folded in from sibling apps (entries with a `source`
 * starting with `app_`). Pairs are unordered; the earlier-logged kind in
 * each day's pairing is treated as A.
 *
 * Window: last 14 days, paired events within 90 minutes, ≥ 3 days required.
 * Median (not mean) of per-day deltas drives the headline number so a
 * single 5-hour outlier doesn't drag the typical gap.
 *
 * Tracks in-memory only; no persistent state. Result count is capped at
 * 2 so the insight panel doesn't drown the other cards.
 */
function correlationInsights(state: ChiwitState): Insight[] {
  const WINDOW_MIN = 90;
  const DAYS_REQUIRED = 3;
  const LOOKBACK_DAYS = 14;
  const cutoffDate = addDays(-(LOOKBACK_DAYS - 1));
  const recent = state.entries.filter((entry) => entry.date >= cutoffDate);

  // Group entries by date, sorted within each day by `createdAt` so the
  // first occurrence of a kind wins for pairing.
  const byDate = new Map<string, PulseEntry[]>();
  for (const entry of recent) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  for (const list of byDate.values()) list.sort((a, b) => a.createdAt - b.createdAt);

  // Per-pair tally — key is the unordered pair "kindA|kindB" (alphabetical
  // so {coffee, mood} and {mood, coffee} bucket together).
  interface PairStats {
    a: EntryKind;
    b: EntryKind;
    days: Set<string>;
    deltas: number[];   // signed minutes from A → B in chronological order
  }
  const pairs = new Map<string, PairStats>();

  for (const [date, list] of byDate) {
    // First-occurrence per kind on this day — pairing the *first* events
    // keeps the morning coffee → mood spike narrative intuitive (the
    // user notices the pattern by recalling "the first sip of the day").
    const firstByKind = new Map<EntryKind, PulseEntry>();
    for (const entry of list) {
      if (!firstByKind.has(entry.kind)) firstByKind.set(entry.kind, entry);
    }
    const kinds = Array.from(firstByKind.keys());
    for (let i = 0; i < kinds.length; i += 1) {
      for (let j = i + 1; j < kinds.length; j += 1) {
        const k1 = kinds[i];
        const k2 = kinds[j];
        if (!k1 || !k2) continue;
        const e1 = firstByKind.get(k1)!;
        const e2 = firstByKind.get(k2)!;
        const deltaMs = e2.createdAt - e1.createdAt;
        const absMin = Math.abs(deltaMs) / 60000;
        if (absMin > WINDOW_MIN) continue;
        // Order the pair alphabetically by kind for stable keys, and orient
        // the delta from the alphabetically-earlier kind to the later one.
        const [a, b, signedMs] = k1 < k2 ? [k1, k2, deltaMs] : [k2, k1, -deltaMs];
        const key = `${a}|${b}`;
        const stats = pairs.get(key);
        if (stats) {
          stats.days.add(date);
          stats.deltas.push(signedMs / 60000);
        } else {
          pairs.set(key, { a, b, days: new Set([date]), deltas: [signedMs / 60000] });
        }
      }
    }
  }

  // Rank by day-frequency; cap at two cards so we don't drown the panel.
  const ranked = Array.from(pairs.values())
    .filter((stats) => stats.days.size >= DAYS_REQUIRED)
    .sort((a, b) => b.days.size - a.days.size)
    .slice(0, 2);

  return ranked.map((stats) => {
    const sorted = [...stats.deltas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const absMedian = Math.abs(Math.round(median));
    const direction = median >= 0
      ? `${KIND_META[stats.a].label.toLowerCase()} usually before ${KIND_META[stats.b].label.toLowerCase()}`
      : `${KIND_META[stats.b].label.toLowerCase()} usually before ${KIND_META[stats.a].label.toLowerCase()}`;
    return {
      id: `correlation-${stats.a}-${stats.b}`,
      title: `${KIND_META[stats.a].label} + ${KIND_META[stats.b].label}`,
      body: `Typically ${absMedian} min apart on ${stats.days.size} of the last ${LOOKBACK_DAYS} days — ${direction}.`,
      tone: 'neutral',
    };
  });
}

/**
 * Bridge `shippie.intent.subscribe(kind, …)` (per-kind handlers) onto
 * the kit's `IntentSubscription` shape (single callback, all kinds).
 * Subscribes to each of MATCHED_KINDS up-front and forwards the
 * `IntentBroadcast` payload as an `IntentLike` event.
 */
export function createIntentSubscriptionAdapter(): IntentSubscription {
  return {
    subscribe(callback: (intent: IntentLike) => void): () => void {
      const unsubs = MATCHED_KINDS.map((kind) =>
        shippie.intent.subscribe(kind, (broadcast: IntentBroadcast) => {
          callback({
            kind: broadcast.intent,
            payload: { rows: broadcast.rows },
            sourceAppId: broadcast.providerAppId,
            timestamp: Date.now(),
          });
        }),
      );
      // Request consent for each kind we want to surface so the
      // container's intent gate doesn't silently drop broadcasts.
      MATCHED_KINDS.forEach((kind) => shippie.requestIntent(kind));
      return () => {
        unsubs.forEach((u) => u());
      };
    },
  };
}

const intentSource = createIntentSubscriptionAdapter();

/** Build a Chiwit `PulseEntry` for a sibling-app intent we matched. */
function ambientEntryForKind(kind: string, signal: AmbientSignalKind, label: string, sourceApp: string, icon: string): PulseEntry {
  const base: PulseEntry = {
    id: id('entry'),
    kind: signal === 'sleep' ? 'sleep'
        : signal === 'movement' ? 'movement'
        : signal === 'mindful' ? 'mindful'
        : signal === 'hydration' ? 'hydration'
        : signal === 'energy' ? 'energy'
        : 'body',
    date: today(),
    value: 3,
    note: label,
    createdAt: Date.now(),
    source: `app_${sourceApp}`,
    sourceIcon: icon,
  };
  // Reasonable defaults so the ambient signal actually moves the pulse.
  if (signal === 'hydration') { base.value = 1; base.amount = 250; base.unit = 'ml'; }
  if (signal === 'movement')  { base.value = 3; base.amount = 20;  base.unit = 'min'; }
  if (signal === 'mindful')   { base.value = 4; base.amount = 5;   base.unit = 'min'; }
  if (signal === 'sleep')     { base.value = 4; base.amount = 7;   base.unit = 'h'; }
  // Suppress unused param warning in strict mode; preserved for symmetry.
  void kind;
  return base;
}

export function App() {
  const [state, setState] = useState<ChiwitState>(() => readState());
  const [customQuickActions, setCustomQuickActions] = useState<CustomQuickAction[]>(() => readCustomQuickActions());
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'today';
    const queryTab = new URL(window.location.href).searchParams.get('tab');
    if (queryTab === 'mood' || queryTab === 'breath' || queryTab === 'body') return 'track';
    return TABS.some((candidate) => candidate.id === queryTab) ? (queryTab as Tab) : 'today';
  });
  const [manualKind, setManualKind] = useState<EntryKind>('mood');
  const [manualValue, setManualValue] = useState('4');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [checkin, setCheckin] = useState({ window: 'morning' as CheckinWindow, mood: '4', energy: '3', body: '4', note: '' });
  const [timelineMonth, setTimelineMonth] = useState<string>(() => today().slice(0, 7));
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [wipeOpen, setWipeOpen] = useState(false);
  const localNavigation = useMemo(() => createLocalNavigation<Tab>(tab, setTab), []);

  const activeQuickActions = useMemo(() => mergeQuickActions(customQuickActions), [customQuickActions]);

  function updateCustomQuickActions(next: CustomQuickAction[]): void {
    setCustomQuickActions(next);
    writeCustomQuickActions(next);
    shippie.feel.texture('toggle');
  }

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  useEffect(() => {
    writeState(state);
  }, [state]);

  // Legacy per-intent subscriptions (kept for back-compat with siblings
  // that emit kinds the new MATCHERS table doesn't cover). These write
  // signals but DO NOT raise toasts — the kit's IntentToastHost is
  // authoritative for ambient-pulse UI.
  useEffect(() => {
    const unsubscribers = [
      shippie.intent.subscribe('brewed-tea', (broadcast) => addLegacyExternalSignal(broadcast, 'mindful', 'Tea ritual', 'brew')),
      shippie.intent.subscribe('wellness-ritual', (broadcast) => addLegacyExternalSignal(broadcast, 'mindful', 'Ritual', 'ritual')),
    ];
    shippie.requestIntent('brewed-tea');
    shippie.requestIntent('wellness-ritual');
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const pulse = useMemo(() => computePulse(state), [state]);
  const reading = useMemo(() => generateReading(state, pulse), [state, pulse]);
  const consistency = useMemo(() => consistencyPct(state), [state]);
  const insights = useMemo(() => generateInsights(state), [state]);
  const todayEntries = entriesForDate(state.entries, today()).sort((a, b) => b.createdAt - a.createdAt);
  const days = useMemo(() => Array.from({ length: 28 }, (_, index) => addDays(-index)), []);
  const monthDays = useMemo(
    () => days.filter((date) => date.startsWith(timelineMonth)),
    [days, timelineMonth],
  );
  const availableMonths = useMemo(
    () => Array.from(new Set(days.map((date) => date.slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [days],
  );

  // Pre-compute the keepsake data once per render — fast (last 7 days).
  const weekKeepsake = useMemo<WeekShapeData>(() => {
    const last7 = Array.from({ length: 7 }, (_, index) => addDays(-(6 - index)));
    const dayShapes: WeekDay[] = last7.map((date) => {
      const p = computePulse(state, date);
      // A day with too few signals has no honest number — render it flat
      // (0) in the ribbon rather than inventing a pulse.
      return { date, pulse: p.overall ?? 0, signalCount: entriesForDate(state.entries, date).length };
    });
    const factors: Array<{ label: string; value: number }> = [
      { label: 'Foundations', value: pulse.breakdown.foundations },
      { label: 'Recovery',    value: pulse.breakdown.recovery },
      { label: 'Movement',    value: pulse.breakdown.movement },
      { label: 'Mind',        value: pulse.breakdown.mind },
      { label: 'Body',        value: pulse.breakdown.body },
    ];
    const totalSignals = last7.reduce((sum, d) => sum + entriesForDate(state.entries, d).length, 0);
    const pulseAvg = average(dayShapes.map((d) => d.pulse)) ?? pulse.overall ?? 0;
    return buildWeekShape({
      days: dayShapes,
      factors,
      signalCount: totalSignals,
      weekStartISO: last7[0]!,
      weekEndISO:   last7[6]!,
      pulseAverage: pulseAvg,
    });
  }, [state, pulse]);

  /**
   * Per-day dominant-factor tone for the WeekContour dots — the kind that
   * was logged most on that day picks the dot colour (via KIND_META, which
   * reads from the `--kind-*` CSS tokens). Days with no entries get null
   * and the dot falls back to the default sage. Tracks last7 ordering so
   * the index lines up with the contour's value array.
   */
  const weekTones = useMemo<Array<string | null>>(() => {
    const last7 = Array.from({ length: 7 }, (_, index) => addDays(-(6 - index)));
    return last7.map((date) => {
      const entries = entriesForDate(state.entries, date);
      if (entries.length === 0) return null;
      const counts = new Map<EntryKind, number>();
      for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
      let bestKind: EntryKind | null = null;
      let bestN = 0;
      for (const [kind, n] of counts) if (n > bestN) { bestKind = kind; bestN = n; }
      return bestKind ? KIND_META[bestKind].color : null;
    });
  }, [state.entries]);

  function navigate(next: Tab): void {
    setTab(next);
    void localNavigation.navigate(next, { kind: 'crossfade', history: 'none' });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'today') url.searchParams.delete('tab');
      else url.searchParams.set('tab', next);
      window.history.replaceState(window.history.state, '', url);
    }
  }

  function addEntry(entry: PulseEntry): void {
    setState((prev) => ({ ...prev, entries: [entry, ...prev.entries].slice(0, 500) }));
    broadcastEntry(entry);
    shippie.feel.texture('confirm');
  }

  function quickLog(action: QuickAction): void {
    addEntry(makeEntry(action));
  }

  /** Handle an ambient cross-app intent that the kit toasted — write the row. */
  function onAmbientIntent(intent: IntentLike): void {
    const match = AMBIENT_BY_KIND[intent.kind];
    if (!match) return;
    const entry = ambientEntryForKind(intent.kind, match.signal, match.label, match.sourceApp, match.icon);
    setState((prev) => {
      const cutoff = Date.now() - 1000 * 60 * 10;
      const dup = prev.entries.some(
        (candidate) =>
          candidate.note === entry.note &&
          candidate.source === entry.source &&
          candidate.createdAt > cutoff,
      );
      return dup ? prev : { ...prev, entries: [entry, ...prev.entries].slice(0, 500) };
    });
  }

  /** Legacy non-matched-kind external signals (e.g. tea, ritual). */
  function addLegacyExternalSignal(
    broadcast: IntentBroadcast,
    kind: EntryKind,
    label: string,
    sourceApp: string,
  ): void {
    if (broadcast.rows.length === 0) return;
    const entry: PulseEntry = {
      id: id('entry'),
      kind,
      date: today(),
      value: 4,
      amount: kind === 'mindful' ? 5 : undefined,
      unit: kind === 'mindful' ? 'min' : undefined,
      note: label,
      createdAt: Date.now(),
      source: `app_${sourceApp}`,
      sourceIcon: kind === 'mindful' ? '🍵' : '✨',
    };
    setState((prev) => {
      const alreadyLogged = prev.entries.some(
        (candidate) =>
          candidate.note === label &&
          candidate.date === entry.date &&
          Date.now() - candidate.createdAt < 1000 * 60 * 10,
      );
      return alreadyLogged ? prev : { ...prev, entries: [entry, ...prev.entries].slice(0, 500) };
    });
  }

  function saveManual(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const amount = manualAmount.trim() ? Number(manualAmount) : undefined;
    const entry: PulseEntry = {
      id: id('entry'),
      kind: manualKind,
      date: today(),
      value: Number(manualValue) || 1,
      amount: Number.isFinite(amount) ? amount : undefined,
      unit: amount ? KIND_META[manualKind].unit : undefined,
      note: manualNote.trim() || undefined,
      createdAt: Date.now(),
    };
    addEntry(entry);
    setManualNote('');
  }

  function saveCheckin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const row: Checkin = {
      id: id('checkin'),
      date: today(),
      window: checkin.window,
      mood: Number(checkin.mood) || 3,
      energy: Number(checkin.energy) || 3,
      body: Number(checkin.body) || 3,
      note: checkin.note.trim() || undefined,
      createdAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      checkins: [row, ...prev.checkins.filter((candidate) => !(candidate.date === row.date && candidate.window === row.window))],
    }));
    shippie.intent.broadcast('mood-logged', [{ score: row.mood, note: row.note, logged_at: new Date(row.createdAt).toISOString() }]);
    shippie.feel.texture('milestone');
    setCheckin((prev) => ({ ...prev, note: '' }));
  }

  function dismissInsight(idToDismiss: string): void {
    setState((prev) => ({ ...prev, dismissedInsightIds: [...prev.dismissedInsightIds, idToDismiss] }));
    shippie.feel.texture('toggle');
  }

  function removeEntry(entryId: string): void {
    setState((prev) => ({ ...prev, entries: prev.entries.filter((entry) => entry.id !== entryId) }));
    shippie.feel.texture('delete');
  }

  function requestWipe(): void {
    setWipeOpen(true);
  }

  function confirmWipe(): void {
    const fresh = emptyState();
    setState(fresh);
    writeState(fresh);
    setWipeOpen(false);
    shippie.feel.texture('delete');
  }

  async function openWeekShare(): Promise<void> {
    // Anonymised week-shape: factors + signal counts only, no notes/IDs.
    const fragment = await encodeShareFragment({
      type: 'chiwit.week-shape',
      payload: {
        week: weekKeepsake.weekLabel,
        pulse: weekKeepsake.pulseNumeric,
        factors: weekKeepsake.factors,
        ribbon: weekKeepsake.ribbon.map((r) => r.value),
      },
    });
    const base = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://chiwit.shippie.app/';
    setQrUrl(`${base}#${fragment}`);
    setQrOpen(true);
  }

  return (
    <main className="chiwit-app">
      <IntentToastHost
        matchers={MATCHERS}
        source={{
          subscribe(cb) {
            return intentSource.subscribe((intent) => {
              onAmbientIntent(intent);
              cb(intent);
            });
          },
        }}
        position="top"
      />

      <header className="app-header">
        <button className="brand-lockup" type="button" onClick={() => navigate('today')} aria-label="Open Chiwit today">
          <img src={CHIWIT_LOGO_URL} alt="" />
          <span>
            <strong>Chiwit</strong>
            <small>Daily Pulse</small>
          </span>
        </button>
        <nav aria-label="Chiwit sections">
          {TABS.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'today' ? (
        <TodayView
          pulse={pulse}
          reading={reading}
          weekValues={weekKeepsake.ribbon.map((r) => r.value)}
          weekTones={weekTones}
          entries={todayEntries}
          insights={insights}
          quickActions={activeQuickActions}
          onQuickLog={quickLog}
          onDismissInsight={dismissInsight}
          onNavigate={navigate}
        />
      ) : null}

      {tab === 'track' ? (
        <TrackView
          yesterdayCheckin={state.checkins.find((c) => c.date === addDays(-1))}
          onRepeatYesterday={(prev) => setCheckin({
            window: prev.window,
            mood: String(prev.mood),
            energy: String(prev.energy),
            body: String(prev.body),
            note: '',
          })}
          manualKind={manualKind}
          manualValue={manualValue}
          manualAmount={manualAmount}
          manualNote={manualNote}
          checkin={checkin}
          onManualKind={setManualKind}
          onManualValue={setManualValue}
          onManualAmount={setManualAmount}
          onManualNote={setManualNote}
          onCheckin={setCheckin}
          onSaveManual={saveManual}
          onSaveCheckin={saveCheckin}
        />
      ) : null}

      {tab === 'patterns' ? (
        <PatternsView
          state={state}
          pulse={pulse}
          consistency={consistency}
          insights={insights}
          weekKeepsake={weekKeepsake}
          onDismissInsight={dismissInsight}
        />
      ) : null}

      {tab === 'timeline' ? (
        <TimelineView
          state={state}
          days={monthDays}
          availableMonths={availableMonths}
          activeMonth={timelineMonth}
          onMonthChange={setTimelineMonth}
          onRemove={removeEntry}
          onNavigate={navigate}
        />
      ) : null}

      {tab === 'data' ? (
        <DataView
          state={state}
          customQuickActions={customQuickActions}
          onUpdateQuickActions={updateCustomQuickActions}
          onWipe={requestWipe}
          onShareWeek={openWeekShare}
        />
      ) : null}

      {wipeOpen ? (
        <WipeConfirmSheet
          entryCount={state.entries.length}
          checkinCount={state.checkins.length}
          onCancel={() => setWipeOpen(false)}
          onConfirm={confirmWipe}
        />
      ) : null}

      <QrShareSheet
        open={qrOpen}
        url={qrUrl}
        title="Pass this week to a friend"
        body="Anonymised week-shape — factors + counts, no notes."
        onClose={() => setQrOpen(false)}
      />
    </main>
  );
}

/**
 * FactorBar — replaces the native `<meter>` in Patterns so the visual
 * register matches the rest of the field-journal voice. The browser-painted
 * meter colours, corner radii, and bar weight are all out of our control,
 * which leaves the bar looking like the only "OS widget" on a hand-set page.
 *
 * Variants:
 *  - default      → factor row (sage gradient → coral cap on full)
 *  - slim         → patterns-progress (short, slim, no tabular label slot)
 *  - consistency  → wide, hairline ground rule, mono tick at 100
 *
 * The fill is a `--fill` CSS variable so the percent stays declarative.
 */
function FactorBar({
  value,
  variant = 'default',
  ariaLabel,
}: {
  value: number;
  variant?: 'default' | 'slim' | 'consistency';
  ariaLabel: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      className={`factor-bar factor-bar--${variant}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={ariaLabel}
      style={{ '--fill': `${pct}%` } as CSSProperties}
    >
      <span className="factor-bar__track" aria-hidden />
      <span className="factor-bar__fill" aria-hidden />
    </span>
  );
}

/**
 * WeekContour — the shape of the week as a drawn line, not a grade.
 *
 * Chiwit's whole pitch is "the shape of the week"; a single 0-100 number
 * is a grade and invites achievement-chasing. The contour shows rhythm:
 * it can't be "won", only noticed. Values are the 7-day pulse series
 * (0-100); a 0 means a day with too few signals to score honestly.
 *
 * Optional `tones` is a colour-per-day array (CSS colours, e.g. the
 * KIND_META `--kind-*` token for the dominant factor that day). When
 * supplied, each dot picks up its day's tone — the contour line stays
 * sage, the dots become a small ledger of "what carried this day".
 */
function WeekContour({ values, tones }: { values: number[]; tones?: Array<string | null> }) {
  const W = 264;
  const H = 72;
  const p = 8;
  const pts = values.length > 1 ? values : [0, 0];
  const stepX = (W - p * 2) / (pts.length - 1);
  const x = (i: number) => p + i * stepX;
  const y = (v: number) => H - p - (Math.max(0, Math.min(100, v)) / 100) * (H - p * 2);
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(pts.length - 1).toFixed(1)} ${H - p} L ${x(0).toFixed(1)} ${H - p} Z`;
  const lastIdx = pts.length - 1;
  // Average ignores honesty-gated 0s — those days had too few signals to score.
  const scored = values.filter((v) => v > 0);
  const avg = scored.length > 0 ? Math.round(scored.reduce((s, v) => s + v, 0) / scored.length) : null;
  return (
    <figure className="week-contour" aria-label="Your pulse across the last seven days">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none">
        <path className="week-contour__area" d={area} />
        <path
          className="week-contour__line"
          d={line}
          pathLength={500}
          strokeDasharray="500"
          strokeDashoffset="500"
        />
        {pts.map((v, i) => {
          const tone = tones?.[i] ?? null;
          // Today's dot keeps its coral halo (week-contour__today). Past-day
          // dots tint to their dominant-factor colour when a `tones` array is
          // supplied — surfacing "what carried this day" without a legend.
          const isToday = i === lastIdx;
          const style = !isToday && tone ? ({ fill: tone } as CSSProperties) : undefined;
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={isToday ? 3.6 : 2}
              className={isToday ? 'week-contour__today' : 'week-contour__dot'}
              style={style}
            />
          );
        })}
      </svg>
      <figcaption>
        Last 7 days
        {avg !== null ? <> · <strong>avg {avg}</strong></> : null}
      </figcaption>
    </figure>
  );
}

function TodayView({
  pulse,
  reading,
  weekValues,
  weekTones,
  entries,
  insights,
  quickActions,
  onQuickLog,
  onDismissInsight,
  onNavigate,
}: {
  pulse: PulseScore;
  reading: string;
  weekValues: number[];
  weekTones?: Array<string | null>;
  entries: PulseEntry[];
  insights: Insight[];
  quickActions?: QuickAction[];
  onQuickLog: (action: QuickAction) => void;
  onDismissInsight: (id: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  // Starter signals always pull from defaults — they're the onboarding
  // tap-points and shouldn't disappear when a user customises the grid.
  const starterSignals = QUICK_ACTIONS.filter((action) => action.kind === 'mood' || action.kind === 'energy' || action.kind === 'hydration');
  const greeting = timeAwareGreeting();
  // Fallback to the default action set when the call site hasn't yet wired
  // the customisable list (work-in-progress prop from a sibling pass).
  const resolvedQuickActions = quickActions ?? QUICK_ACTIONS;
  return (
    <section className="page-shell today-shell">
      <div className="hero-plane">
        <div>
          <p className="eyebrow">Today · Daily Pulse</p>
          <h1>{greeting}</h1>
          <p className="reading">{reading}</p>
          <div className="signal-composer" aria-label="Start a check-in">
            {starterSignals.map((action) => (
              <button key={action.label} type="button" onClick={() => onQuickLog(action)}>
                <span style={{ background: KIND_META[action.kind].color }} />
                <strong>{action.label.replace(' · ', ' ')}</strong>
                <small className="factor-boost">{action.helper}</small>
              </button>
            ))}
          </div>
          <WeekContour values={weekValues} tones={weekTones} />
          <div className="hero-actions">
            <button type="button" className="primary" onClick={() => onNavigate('track')}>Log now</button>
            <button type="button" onClick={() => onNavigate('patterns')}>Patterns</button>
          </div>
        </div>
        <PulseRing pulse={pulse} />
      </div>
      <section className="quick-panel">
        <SectionHeading title="One-tap signals" action="Quick log" />
        <div className="quick-grid" aria-label="Quick log">
          {resolvedQuickActions.map((action, index) => (
            <button key={`${action.label}-${index}`} type="button" onClick={() => onQuickLog(action)}>
              <span style={{ background: KIND_META[action.kind].color }} />
              <strong>{action.label}</strong>
              <small className="factor-boost">{action.helper}</small>
            </button>
          ))}
          {resolvedQuickActions.length === 0 ? (
            <p className="quick-grid__empty">All quick actions hidden — restore them in Data → Customize quick log.</p>
          ) : null}
        </div>
      </section>
      <section className="split-layout">
        <div>
          <SectionHeading title="Today" action={`${entries.length} signal${entries.length === 1 ? '' : 's'}`} />
          {entries.length === 0 ? (
            <EmptyState
              eyebrow="Today"
              headline="Today's empty. Start with the thing you noticed in the last hour."
              cta={{ label: 'Log now', onClick: () => onNavigate('track') }}
            />
          ) : (
            <EntryList entries={entries.slice(0, 8)} />
          )}
        </div>
        <aside className="insight-panel">
          <h2>What Chiwit notices</h2>
          {insights.slice(0, 3).map((insight) => (
            <InsightCard key={insight.id} insight={insight} onDismiss={onDismissInsight} />
          ))}
          {insights.length === 0 ? (
            <EmptyState
              eyebrow="Insights"
              headline={<>Signals from <em>2 days</em> build the first pattern card.</>}
              body={
                <span className="insight-example">
                  e.g. <em>"Mood lifts on days you log a short walk before noon."</em>
                </span>
              }
            />
          ) : null}
        </aside>
      </section>
    </section>
  );
}

function TrackView({
  yesterdayCheckin,
  onRepeatYesterday,
  manualKind,
  manualValue,
  manualAmount,
  manualNote,
  checkin,
  onManualKind,
  onManualValue,
  onManualAmount,
  onManualNote,
  onCheckin,
  onSaveManual,
  onSaveCheckin,
}: {
  yesterdayCheckin: Checkin | undefined;
  onRepeatYesterday: (prev: Checkin) => void;
  manualKind: EntryKind;
  manualValue: string;
  manualAmount: string;
  manualNote: string;
  checkin: { window: CheckinWindow; mood: string; energy: string; body: string; note: string };
  onManualKind: (kind: EntryKind) => void;
  onManualValue: (value: string) => void;
  onManualAmount: (value: string) => void;
  onManualNote: (value: string) => void;
  onCheckin: (value: { window: CheckinWindow; mood: string; energy: string; body: string; note: string }) => void;
  onSaveManual: (event: FormEvent<HTMLFormElement>) => void;
  onSaveCheckin: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="page-shell track-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Track</p>
          <h1>Check in.</h1>
          <p className="toolbar-subcopy">One gentle read now, or a specific signal when you know the detail.</p>
        </div>
      </div>
      <div className="form-layout">
        <form className="tracking-form" onSubmit={onSaveCheckin}>
          <div className="tracking-form__header">
            <h2>Daily check-in</h2>
            {yesterdayCheckin ? (
              <button
                type="button"
                className="repeat-yesterday"
                onClick={() => onRepeatYesterday(yesterdayCheckin)}
                title="Pre-fill from yesterday's check-in"
              >
                ↺ Repeat yesterday
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              Window
              <select value={checkin.window} onChange={(event) => onCheckin({ ...checkin, window: event.target.value as CheckinWindow })}>
                <option value="morning">morning</option>
                <option value="afternoon">afternoon</option>
                <option value="evening">evening</option>
              </select>
            </label>
            <label>
              <span className="range-label">Mood<em>{checkin.mood} / 5</em></span>
              <input value={checkin.mood} min={1} max={5} type="range" onChange={(event) => onCheckin({ ...checkin, mood: event.target.value })} />
            </label>
            <label>
              <span className="range-label">Energy<em>{checkin.energy} / 5</em></span>
              <input value={checkin.energy} min={1} max={5} type="range" onChange={(event) => onCheckin({ ...checkin, energy: event.target.value })} />
            </label>
            <label>
              <span className="range-label">Body<em>{checkin.body} / 5</em></span>
              <input value={checkin.body} min={1} max={5} type="range" onChange={(event) => onCheckin({ ...checkin, body: event.target.value })} />
            </label>
          </div>
          <textarea value={checkin.note} onChange={(event) => onCheckin({ ...checkin, note: event.target.value })} placeholder="One line, optional" />
          <button type="submit" className="primary">Save check-in</button>
        </form>

        <form className="tracking-form" onSubmit={onSaveManual}>
          <h2>Specific signal</h2>
          <div className="form-grid">
            <label>
              Signal
              <select value={manualKind} onChange={(event) => onManualKind(event.target.value as EntryKind)}>
                {Object.entries(KIND_META).map(([kind, meta]) => <option key={kind} value={kind}>{meta.label}</option>)}
              </select>
            </label>
            <label>
              <span className="range-label">Score<em>{manualValue} / 5</em></span>
              <input value={manualValue} min={1} max={5} type="range" onChange={(event) => onManualValue(event.target.value)} />
            </label>
            <label>
              Amount
              <input value={manualAmount} onChange={(event) => onManualAmount(event.target.value)} inputMode="decimal" placeholder={KIND_META[manualKind].unit} />
            </label>
          </div>
          <p className="helper-text">{KIND_META[manualKind].helper}</p>
          <textarea value={manualNote} onChange={(event) => onManualNote(event.target.value)} placeholder="Context, trigger, or detail" />
          <button type="submit" className="primary">Log signal</button>
        </form>
      </div>
    </section>
  );
}

function PatternsView({
  state,
  pulse,
  consistency,
  insights,
  weekKeepsake,
  onDismissInsight,
}: {
  state: ChiwitState;
  pulse: PulseScore;
  consistency: number;
  insights: Insight[];
  weekKeepsake: WeekShapeData;
  onDismissInsight: (id: string) => void;
}) {
  // §4.4 — Patterns (insufficient).
  const totalSignals = state.entries.length;
  const daysCovered = new Set(state.entries.map((entry) => entry.date)).size;
  const insufficient = totalSignals < 5 || daysCovered < 3;
  if (insufficient) {
    const signalsPct = Math.min(100, Math.round((totalSignals / 5) * 100));
    const daysPct = Math.min(100, Math.round((daysCovered / 3) * 100));
    return (
      <section className="page-shell">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Patterns</p>
            <h1>Your pattern.</h1>
          </div>
        </div>
        <EmptyState
          eyebrow="Patterns"
          headline={<>Five signals across <em>three days</em> will show your shape.</>}
          body={
            <span className="patterns-progress" aria-label="Pattern progress">
              <span className="patterns-progress__row">
                <strong>Signals</strong>
                <FactorBar value={signalsPct} variant="slim" ariaLabel={`Signals progress ${totalSignals} of 5`} />
                <em>{totalSignals}/5</em>
              </span>
              <span className="patterns-progress__row">
                <strong>Days covered</strong>
                <FactorBar value={daysPct} variant="slim" ariaLabel={`Days covered ${daysCovered} of 3`} />
                <em>{daysCovered}/3</em>
              </span>
            </span>
          }
        />
      </section>
    );
  }

  const filename = `chiwit-week-${isoWeekCode(weekKeepsake.weekStartISO)}.pdf`;

  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Patterns</p>
          <h1>Your pattern.</h1>
        </div>
        <KeepsakeRenderer
          template={WeeklyShape}
          data={weekKeepsake}
          filename={filename}
          trigger={(open, busy) => (
            <button type="button" className="branded primary" disabled={busy} onClick={open}>
              {busy ? 'Drawing…' : 'Share this week'}
            </button>
          )}
        />
      </div>
      <section className="consistency-card" aria-label="7-day consistency">
        <div>
          <p className="eyebrow">7-day consistency</p>
          <strong>{consistency}%</strong>
          <small>
            {consistency >= 70 ? 'Steady rhythm — keep the bar kind.' :
             consistency >= 40 ? 'A few quiet days. That is okay.' :
             'Logging is sparse this week. Three signals counts as a day.'}
          </small>
          <small className="consistency-legend">Days with 3+ signals logged · last 7</small>
        </div>
        <FactorBar value={consistency} variant="consistency" ariaLabel={`Weekly consistency ${consistency} percent`} />
      </section>
      <section className="category-grid">
        {(Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>).map(([key, value]) => (
          <div key={key} className="category-row">
            <strong>
              {FACTOR_NAMES[key]}
              <em className="factor-helper">{FACTOR_HELPER_TEXT[key]}</em>
            </strong>
            <span className="category-row__value">{value}</span>
            <FactorBar value={value} ariaLabel={`${FACTOR_NAMES[key]} factor ${value} out of 100`} />
          </div>
        ))}
      </section>
      <div className="insight-grid">
        {insights.length === 0 ? (
          <EmptyState
            eyebrow="Insights"
            headline={<>Signals from <em>2 days</em> build the first pattern card.</>}
            body={
              <span className="insight-example">
                e.g. <em>"Mood lifts on days you log a short walk before noon."</em>
              </span>
            }
          />
        ) : insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} onDismiss={onDismissInsight} />
        ))}
      </div>
      <section className="week-ribbon" aria-label="Fourteen day pulse">
        {Array.from({ length: 14 }, (_, index) => {
          const date = addDays(index - 13);
          const score = computePulse(state, date).overall;
          return (
            <span
              key={date}
              title={`${formatDate(date)}: ${score ?? '—'}`}
              style={{ height: `${Math.max(14, score ?? 0)}%` }}
            />
          );
        })}
      </section>
    </section>
  );
}

function TimelineView({
  state,
  days,
  availableMonths,
  activeMonth,
  onMonthChange,
  onRemove,
  onNavigate,
}: {
  state: ChiwitState;
  days: string[];
  availableMonths: string[];
  activeMonth: string;
  onMonthChange: (next: string) => void;
  onRemove: (entryId: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  if (state.entries.length === 0) {
    return (
      <section className="page-shell">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Timeline</p>
            <h1>Recent rhythm.</h1>
          </div>
        </div>
        <EmptyState
          eyebrow="Timeline"
          headline="Your first week opens here."
          body="Log a signal — mood, hydration, a short walk — and this view starts drawing your rhythm by day."
          cta={{ label: 'Log a signal', onClick: () => onNavigate('track') }}
        />
      </section>
    );
  }
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Timeline</p>
          <h1>Recent rhythm.</h1>
        </div>
      </div>
      <nav className="month-scrubber" aria-label="Jump to month">
        {availableMonths.map((month) => (
          <button
            key={month}
            type="button"
            className={month === activeMonth ? 'active' : ''}
            onClick={() => onMonthChange(month)}
          >
            {formatMonthLabel(month)}
          </button>
        ))}
      </nav>
      <div className="timeline-list">
        {days.slice(0, 12).map((date, index) => {
          const entries = entriesForDate(state.entries, date).sort((a, b) => b.createdAt - a.createdAt);
          const pulse = computePulse(state, date);
          // First 3 days expanded by default per the brief — covers today
          // + yesterday + the day before so the user immediately sees the
          // recent shape, then older days fold to keep the page calm.
          const defaultOpen = index < 3 && entries.length > 0;
          return (
            <TimelineDay
              key={date}
              date={date}
              entries={entries}
              pulseOverall={pulse.overall}
              defaultOpen={defaultOpen}
              onRemove={onRemove}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * One row in the Timeline list — expandable per-day disclosure.
 *
 * First 3 days open by default (per brief); empty days render their muted
 * "no signals" placeholder collapsed and are non-interactive (clicking the
 * header is a no-op when there's nothing to reveal).
 *
 * The entries list animates open with a 280ms max-height transition. We
 * track `open` in component state and apply `aria-expanded` to the header
 * button for screen readers; the chevron rotates 90° on open.
 */
function TimelineDay({
  date,
  entries,
  pulseOverall,
  defaultOpen,
  onRemove,
}: {
  date: string;
  entries: PulseEntry[];
  pulseOverall: number | null;
  defaultOpen: boolean;
  onRemove: (entryId: string) => void;
}) {
  const empty = entries.length === 0;
  const [open, setOpen] = useState<boolean>(defaultOpen && !empty);

  function toggle(): void {
    if (empty) return;
    setOpen((prev) => !prev);
  }

  return (
    <section className={`timeline-day${open ? ' is-open' : ''}${empty ? ' is-empty' : ''}`}>
      <header>
        <button
          type="button"
          className="timeline-day__toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`timeline-day-body-${date}`}
          disabled={empty}
        >
          <span className="timeline-day__chevron" aria-hidden>›</span>
          <h2>{formatDate(date)}</h2>
        </button>
        <strong>{pulseOverall ?? (empty ? '·' : '—')}</strong>
      </header>
      <div
        className="timeline-day__body"
        id={`timeline-day-body-${date}`}
        role="region"
        aria-label={`${formatDate(date)} signals`}
        hidden={!open && empty}
      >
        {empty ? (
          <p className="timeline-day__quiet">no signals</p>
        ) : (
          <EntryList entries={entries} onRemove={onRemove} />
        )}
      </div>
    </section>
  );
}

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  if (!y || !m) return yyyymm;
  const d = new Date(Number(y), Number(m) - 1, 15);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

/**
 * CSV export — Apple Health-friendly columns. RFC 4180 quoting: double
 * any embedded quote, wrap fields containing commas/quotes/newlines.
 * Filename matches the recap convention: chiwit-signals-YYYYMMDD.csv.
 */
function csvField(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function entriesToCsv(entries: PulseEntry[]): string {
  const header = ['date', 'time', 'kind', 'value', 'amount', 'unit', 'note', 'source'];
  const rows = entries
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((entry) => {
      const t = new Date(entry.createdAt);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      return [
        entry.date,
        `${hh}:${mm}`,
        entry.kind,
        entry.value,
        entry.amount ?? '',
        entry.unit ?? KIND_META[entry.kind].unit,
        entry.note ?? '',
        entry.source ?? '',
      ].map(csvField).join(',');
    });
  return [header.join(','), ...rows].join('\n');
}

function downloadCsv(state: ChiwitState): void {
  const csv = entriesToCsv(state.entries);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chiwit-signals-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DataView({
  state,
  customQuickActions,
  onUpdateQuickActions,
  onWipe,
  onShareWeek,
}: {
  state: ChiwitState;
  customQuickActions: CustomQuickAction[];
  onUpdateQuickActions: (next: CustomQuickAction[]) => void;
  onWipe: () => void;
  onShareWeek: () => void | Promise<void>;
}) {
  const bytes = new Blob([JSON.stringify(state)]).size;
  return (
    <section className="page-shell data-page">
      <p className="eyebrow">Local data</p>
      <h1>Your Chiwit data.</h1>
      <div className="data-hero">
        <div>
          <p className="measure">
            Chiwit stores your Daily Pulse on this device. Shippie hosts the app package and recovery wrapper; your entries do not live in a Chiwit or Shippie app database.
          </p>
          <p className="data-hero__tagline">A device. A vault. Nothing in between.</p>
        </div>
        {/* Inline SVG pictogram — device + vault/lock in sage hairline strokes. */}
        <svg className="data-hero__art" viewBox="0 0 220 140" role="img" aria-label="Your data lives on this device" preserveAspectRatio="xMidYMid meet">
          {/* device — phone-shaped slab with a small status bar */}
          <rect x="20" y="22" width="78" height="106" rx="10" ry="10" />
          <rect x="30" y="32" width="58" height="78" rx="3" ry="3" className="data-hero__art-screen" />
          <line x1="38" y1="46" x2="78" y2="46" />
          <line x1="38" y1="58" x2="68" y2="58" />
          <line x1="38" y1="70" x2="74" y2="70" />
          <circle cx="59" cy="118" r="2.5" />
          {/* dotted-line bridge (not a real network — locality cue) */}
          <line x1="108" y1="74" x2="132" y2="74" strokeDasharray="3 4" />
          {/* vault / lock — squat safe with a circle dial + hairline shackle */}
          <rect x="138" y="42" width="68" height="68" rx="6" ry="6" />
          <circle cx="172" cy="76" r="14" />
          <circle cx="172" cy="76" r="3" className="data-hero__art-dot" />
          <line x1="172" y1="60" x2="172" y2="56" />
          <line x1="172" y1="92" x2="172" y2="96" />
          <line x1="156" y1="76" x2="152" y2="76" />
          <line x1="188" y1="76" x2="192" y2="76" />
          {/* shackle hint above the vault */}
          <path d="M 158 42 v -6 a 14 14 0 0 1 28 0 v 6" fill="none" />
        </svg>
      </div>
      <section className="metric-strip">
        <div><strong>{state.entries.length}</strong><span>signals</span></div>
        <div><strong>{state.checkins.length}</strong><span>check-ins</span></div>
        <div><strong>{Math.ceil(bytes / 1024)} KB</strong><span>local payload</span></div>
      </section>

      <BackupCard appSlug="chiwit" store={backupStore} />

      <CustomizeQuickLog
        customQuickActions={customQuickActions}
        onUpdate={onUpdateQuickActions}
      />

      <div className="data-share">
        <h2>Share this week</h2>
        <p className="measure">
          A scannable, anonymised QR for the last seven days — factors and counts only. No notes leave this device.
        </p>
        <button type="button" className="branded primary" onClick={() => void onShareWeek()}>
          Open QR
        </button>
      </div>

      <div className="data-share">
        <h2>Export signals</h2>
        <p className="measure">
          Download a CSV of every signal on this device — Apple Health-friendly columns (date, time, kind, value, amount, unit, note, source).
        </p>
        <button
          type="button"
          className="branded primary"
          onClick={() => downloadCsv(state)}
          disabled={state.entries.length === 0}
        >
          Download CSV
        </button>
      </div>

      <button type="button" className="danger" onClick={onWipe}>Clear this device</button>
    </section>
  );
}

function WipeConfirmSheet({
  entryCount,
  checkinCount,
  onCancel,
  onConfirm,
}: {
  entryCount: number;
  checkinCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="shippie-qr-sheet" role="dialog" aria-modal="true" aria-labelledby="wipe-title" onClick={onCancel}>
      <section className="shippie-qr-sheet__surface wipe-confirm-sheet" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="shippie-qr-sheet__close" onClick={onCancel} aria-label="Cancel clear data">
          ×
        </button>
        <p className="eyebrow">Clear local data</p>
        <h2 id="wipe-title" className="shippie-qr-sheet__title">Clear Chiwit on this device?</h2>
        <p className="shippie-qr-sheet__body">
          This removes your local pulse history from this browser. It does not affect other devices or any exports you already saved.
        </p>
        <div className="wipe-confirm-sheet__stats" aria-label="Data that will be removed">
          <span><strong>{entryCount}</strong><small>signals</small></span>
          <span><strong>{checkinCount}</strong><small>check-ins</small></span>
        </div>
        <div className="shippie-qr-sheet__actions">
          <button type="button" onClick={onCancel}>Keep data</button>
          <button type="button" className="danger" onClick={onConfirm}>Clear device</button>
        </div>
      </section>
    </div>
  );
}

function PulseRing({ pulse }: { pulse: PulseScore }) {
  const factors = Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>;
  // When the pulse has too few signals it shows "—" instead of a number;
  // the ring now fills to *momentum* (logged / 3) so the surface shows how
  // close the user is to earning their first honest pulse, not a baseline.
  const hasPulse = pulse.overall !== null;
  const REQUIRED = 3;
  const progressPct = Math.min(100, Math.round((pulse.loggedCount / REQUIRED) * 100));
  const ringScore = hasPulse ? pulse.overall : progressPct;
  const aria = hasPulse
    ? `Daily Pulse ${pulse.overall}`
    : `Daily Pulse — ${pulse.loggedCount} of ${REQUIRED} factors logged`;
  return (
    <section
      className={`pulse-card${hasPulse ? '' : ' pulse-card--progress'}`}
      aria-label={aria}
    >
      <div
        className={`pulse-ring${hasPulse ? '' : ' pulse-ring--progress'}`}
        style={{ '--score': ringScore } as CSSProperties}
      >
        <img src={CHIWIT_LOGO_URL} alt="" />
        {hasPulse ? (
          <strong>
            {pulse.overall}
            {/* "/100" set small + italic Fraunces — the unit reads as
             * poetry against the giant digit, not as a label. */}
            <em className="pulse-ring__unit" aria-hidden>/100</em>
          </strong>
        ) : (
          <strong className="pulse-ring__progress">
            {pulse.loggedCount}<span>/{REQUIRED}</span>
          </strong>
        )}
        <span>{hasPulse ? 'Daily Pulse' : 'Factors logged'}</span>
      </div>
      <div className="pulse-factors" aria-label="Pulse factors">
        {factors.map(([key, value]) => (
          <span key={key} className={pulse.logged[key] ? '' : 'is-unlogged'}>
            <i style={{ inlineSize: `${Math.max(18, value)}%` }} />
            <strong>{key}{pulse.logged[key] ? '' : ' · not yet'}</strong>
          </span>
        ))}
      </div>
      <p className="pulse-message">{pulse.message}</p>
    </section>
  );
}

function SectionHeading({ title, action }: { title: string; action?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action ? <span>{action}</span> : null}
    </div>
  );
}

function EntryList({ entries, onRemove }: { entries: PulseEntry[]; onRemove?: (entryId: string) => void }) {
  if (entries.length === 0) return <p className="empty">No signals yet for this day.</p>;
  return (
    <ul className="entry-list">
      {entries.map((entry) => (
        <li key={entry.id} className={entry.source ? 'is-ambient' : ''}>
          <span style={{ background: KIND_META[entry.kind].color }} />
          <div>
            <strong>
              {KIND_META[entry.kind].label}
              {entry.sourceIcon ? <em className="entry-source-icon" title={entry.source ?? ''}>{entry.sourceIcon}</em> : null}
            </strong>
            <small>
              {entry.amount ?? entry.value}{entry.unit ?? KIND_META[entry.kind].unit}
              {entry.note ? ` - ${entry.note}` : ''}
              {entry.source ? ` · ${entry.source.replace(/^app_/, '')}` : ''}
            </small>
          </div>
          {onRemove ? <button type="button" onClick={() => onRemove(entry.id)} aria-label={`Remove ${KIND_META[entry.kind].label} signal from ${formatDate(entry.date)}${entry.note ? ` — ${entry.note}` : ''}`}>×</button> : null}
        </li>
      ))}
    </ul>
  );
}

function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: (id: string) => void }) {
  return (
    <article className={`insight-card insight-card--${insight.tone} ${insight.tone}`}>
      <div>
        <strong>{insight.title}</strong>
        <p>{insight.body}</p>
      </div>
      <button type="button" onClick={() => onDismiss(insight.id)} aria-label="Dismiss insight">×</button>
    </article>
  );
}

/**
 * Customize quick log — lives inside the Data view per the chiwit IA
 * (no new tab, per design brief). Lets the user reorder default actions
 * with up/down chevrons, hide ones they never use, and add custom rows.
 *
 * The pane materialises the merged default+custom list (so reordering is
 * intuitive) and emits a normalised `CustomQuickAction[]` back to App.
 */
function CustomizeQuickLog({
  customQuickActions,
  onUpdate,
}: {
  customQuickActions: CustomQuickAction[];
  onUpdate: (next: CustomQuickAction[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<EntryKind>('hydration');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftUnit, setDraftUnit] = useState('');
  const [draftLabel, setDraftLabel] = useState('');

  const workingList: CustomQuickAction[] = useMemo(() => {
    if (customQuickActions.length === 0) {
      return QUICK_ACTIONS.map((action) => ({
        kind: action.kind,
        amount: action.amount,
        unit: action.unit,
      }));
    }
    const merged = [...customQuickActions];
    for (const action of QUICK_ACTIONS) {
      const sig = quickActionSignature(action);
      if (!merged.some((row) => !row.custom && quickActionSignature(row) === sig)) {
        merged.push({ kind: action.kind, amount: action.amount, unit: action.unit });
      }
    }
    return merged;
  }, [customQuickActions]);

  function commit(next: CustomQuickAction[]): void {
    onUpdate(next);
  }

  function move(index: number, delta: number): void {
    const next = [...workingList];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    commit(next);
  }

  function toggleHidden(index: number): void {
    const next = [...workingList];
    const row = next[index];
    if (!row) return;
    next[index] = { ...row, hidden: !row.hidden };
    commit(next);
  }

  function removeRow(index: number): void {
    const next = [...workingList];
    next.splice(index, 1);
    commit(next);
  }

  function resetDefaults(): void {
    commit([]);
  }

  function handleAdd(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const amount = draftAmount.trim() ? Number(draftAmount) : undefined;
    const unit = draftUnit.trim() || (amount !== undefined ? KIND_META[draftKind].unit : undefined);
    const label = draftLabel.trim() || `${KIND_META[draftKind].label}${amount !== undefined ? ` · +${amount}${unit ?? ''}` : ' · custom'}`;
    const next: CustomQuickAction[] = [
      ...workingList,
      {
        kind: draftKind,
        amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
        unit,
        label,
        custom: true,
      },
    ];
    commit(next);
    setDraftAmount('');
    setDraftUnit('');
    setDraftLabel('');
    setAddOpen(false);
  }

  function labelFor(row: CustomQuickAction): string {
    if (row.custom) return row.label ?? `${KIND_META[row.kind].label} · custom`;
    const sig = quickActionSignature(row);
    const base = QUICK_ACTIONS.find((action) => quickActionSignature(action) === sig);
    return row.label ?? base?.label ?? KIND_META[row.kind].label;
  }

  return (
    <section className="customize-quick" aria-labelledby="customize-quick-title">
      <header className="customize-quick__header">
        <div>
          <h2 id="customize-quick-title">Customize quick log</h2>
          <p className="measure">
            Reorder, hide, or add the one-tap signals on the Today screen. Stored on this device only.
          </p>
        </div>
        {customQuickActions.length > 0 ? (
          <button type="button" className="customize-quick__reset" onClick={resetDefaults} title="Restore default quick actions">
            Reset
          </button>
        ) : null}
      </header>

      <ol className="customize-quick__list" aria-label="Quick action order">
        {workingList.map((row, index) => {
          const hidden = !!row.hidden;
          return (
            <li key={`${quickActionSignature(row)}-${index}-${row.custom ? 'c' : 'd'}`} className={hidden ? 'is-hidden' : ''}>
              <span className="customize-quick__dot" style={{ background: KIND_META[row.kind].color }} aria-hidden />
              <span className="customize-quick__label">
                <strong>{labelFor(row)}</strong>
                <small>{row.custom ? 'custom' : KIND_META[row.kind].helper}</small>
              </span>
              <div className="customize-quick__controls" role="group" aria-label={`Reorder ${labelFor(row)}`}>
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${labelFor(row)} up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === workingList.length - 1}
                  aria-label={`Move ${labelFor(row)} down`}
                >
                  ▼
                </button>
                {row.custom ? (
                  <button
                    type="button"
                    className="customize-quick__remove"
                    onClick={() => removeRow(index)}
                    aria-label={`Remove ${labelFor(row)}`}
                  >
                    ×
                  </button>
                ) : (
                  <button
                    type="button"
                    className="customize-quick__toggle"
                    onClick={() => toggleHidden(index)}
                    aria-pressed={!hidden}
                    aria-label={hidden ? `Show ${labelFor(row)}` : `Hide ${labelFor(row)}`}
                  >
                    {hidden ? 'Show' : 'Hide'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {addOpen ? (
        <form className="customize-quick__add" onSubmit={handleAdd}>
          <div className="form-grid">
            <label>
              Kind
              <select value={draftKind} onChange={(event) => setDraftKind(event.target.value as EntryKind)}>
                {Object.entries(KIND_META).map(([kind, meta]) => (
                  <option key={kind} value={kind}>{meta.label}</option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                value={draftAmount}
                onChange={(event) => setDraftAmount(event.target.value)}
                inputMode="decimal"
                placeholder={KIND_META[draftKind].unit}
              />
            </label>
            <label>
              Unit
              <input
                value={draftUnit}
                onChange={(event) => setDraftUnit(event.target.value)}
                placeholder={KIND_META[draftKind].unit}
              />
            </label>
            <label>
              Label
              <input
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                placeholder={`${KIND_META[draftKind].label} · custom`}
              />
            </label>
          </div>
          <div className="customize-quick__add-actions">
            <button type="button" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="primary">Add quick action</button>
          </div>
        </form>
      ) : (
        <button type="button" className="customize-quick__add-btn" onClick={() => setAddOpen(true)}>
          + Add custom
        </button>
      )}
    </section>
  );
}
