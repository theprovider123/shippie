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

/** Placeholder value used to render un-logged factor bars at a calm baseline. */
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
const CHIWIT_LOGO_URL = `${import.meta.env.BASE_URL}brand/chiwit-logo.png`;
const backupStore = createChiwitBackupStore();

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'track', label: 'Log' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'data', label: 'Data' },
];

const KIND_META: Record<EntryKind, { label: string; color: string; unit: string; helper: string }> = {
  mood:      { label: 'Mood',         color: '#F97066', unit: '/5',  helper: 'Mind factor' },
  energy:    { label: 'Energy',       color: '#FF9800', unit: '/5',  helper: 'Mind factor' },
  sleep:     { label: 'Sleep',        color: '#9575CD', unit: 'h',   helper: 'Recovery factor' },
  hydration: { label: 'Hydration',    color: '#42A5F5', unit: 'ml',  helper: 'Foundations factor' },
  movement:  { label: 'Movement',     color: '#66BB6A', unit: 'min', helper: 'Movement factor' },
  mindful:   { label: 'Mindful',      color: '#26A69A', unit: 'min', helper: 'Recovery factor' },
  body:      { label: 'Body',         color: '#8D6E63', unit: '/5',  helper: 'Body factor' },
  weight:    { label: 'Body metrics', color: '#A5D6A7', unit: 'kg',  helper: 'Body factor' },
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

  return insights.filter((insight) => !state.dismissedInsightIds.includes(insight.id));
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
          entries={todayEntries}
          insights={insights}
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
        <DataView state={state} onWipe={requestWipe} onShareWeek={openWeekShare} />
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
 * WeekContour — the shape of the week as a drawn line, not a grade.
 *
 * Chiwit's whole pitch is "the shape of the week"; a single 0-100 number
 * is a grade and invites achievement-chasing. The contour shows rhythm:
 * it can't be "won", only noticed. Values are the 7-day pulse series
 * (0-100); a 0 means a day with too few signals to score honestly.
 */
function WeekContour({ values }: { values: number[] }) {
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
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === lastIdx ? 3.6 : 2} className={i === lastIdx ? 'week-contour__today' : 'week-contour__dot'} />
        ))}
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
  entries,
  insights,
  onQuickLog,
  onDismissInsight,
  onNavigate,
}: {
  pulse: PulseScore;
  reading: string;
  weekValues: number[];
  entries: PulseEntry[];
  insights: Insight[];
  onQuickLog: (action: QuickAction) => void;
  onDismissInsight: (id: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const starterSignals = QUICK_ACTIONS.filter((action) => action.kind === 'mood' || action.kind === 'energy' || action.kind === 'hydration');
  const greeting = timeAwareGreeting();
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
          <WeekContour values={weekValues} />
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
          {QUICK_ACTIONS.map((action) => (
            <button key={action.label} type="button" onClick={() => onQuickLog(action)}>
              <span style={{ background: KIND_META[action.kind].color }} />
              <strong>{action.label}</strong>
              <small className="factor-boost">{action.helper}</small>
            </button>
          ))}
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
                <meter min={0} max={100} value={signalsPct} />
                <em>{totalSignals}/5</em>
              </span>
              <span className="patterns-progress__row">
                <strong>Days covered</strong>
                <meter min={0} max={100} value={daysPct} />
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
        <meter min={0} max={100} value={consistency} />
      </section>
      <section className="category-grid">
        {(Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>).map(([key, value]) => (
          <div key={key} className="category-row">
            <strong>
              {FACTOR_NAMES[key]}
              <em className="factor-helper">{FACTOR_HELPER_TEXT[key]}</em>
            </strong>
            <span>{value}</span>
            <meter min={0} max={100} value={value} />
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
        {days.filter((date) => entriesForDate(state.entries, date).length > 0 || date === today()).slice(0, 12).map((date) => {
          const entries = entriesForDate(state.entries, date).sort((a, b) => b.createdAt - a.createdAt);
          const pulse = computePulse(state, date);
          return (
            <section className="timeline-day" key={date}>
              <header>
                <h2>{formatDate(date)}</h2>
                <strong>{pulse.overall ?? '—'}</strong>
              </header>
              <EntryList entries={entries} onRemove={onRemove} />
            </section>
          );
        })}
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
  onWipe,
  onShareWeek,
}: {
  state: ChiwitState;
  onWipe: () => void;
  onShareWeek: () => void | Promise<void>;
}) {
  const bytes = new Blob([JSON.stringify(state)]).size;
  return (
    <section className="page-shell data-page">
      <p className="eyebrow">Local data</p>
      <h1>Your Chiwit data.</h1>
      <p className="measure">
        Chiwit stores your Daily Pulse on this device. Shippie hosts the app package and recovery wrapper; your entries do not live in a Chiwit or Shippie app database.
      </p>
      <section className="metric-strip">
        <div><strong>{state.entries.length}</strong><span>signals</span></div>
        <div><strong>{state.checkins.length}</strong><span>check-ins</span></div>
        <div><strong>{Math.ceil(bytes / 1024)} KB</strong><span>local payload</span></div>
      </section>

      <BackupCard appSlug="chiwit" store={backupStore} />

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
          <strong>{pulse.overall}</strong>
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
          {onRemove ? <button type="button" onClick={() => onRemove(entry.id)} aria-label={`Remove ${KIND_META[entry.kind].label}`}>×</button> : null}
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
