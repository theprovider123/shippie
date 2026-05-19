import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { createShippieIframeSdk, type IntentBroadcast } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import {
  BackupCard,
  EmptyState,
  IntentToastHost,
  KeepsakeRenderer,
  OnboardingFlow,
  QrShareSheet,
  encodeShareFragment,
  type IntentLike,
  type IntentSubscription,
  type OnboardingSlide,
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

interface PulseScore {
  overall: number;
  breakdown: ScoreBreakdown;
  message: string;
}

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

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    title: 'Five signals a day. No app account.',
    body: 'A signal is a small note — water, sleep, a walk, a mood. Everything stays on this device. Chiwit is local-first; there is no Chiwit cloud.',
    cta: 'Next',
  },
  {
    title: 'Your other apps already know about your coffee, sleep, workouts. Chiwit reads them so you don’t double-log.',
    body: 'When a sibling Shippie app logs something, it folds in here as an ambient signal. You’ll see a small icon on the row so you can audit where it came from.',
    cta: 'Next',
  },
  {
    title: 'Tap a quick-signal pill, or open Log when you have a sentence.',
    body: 'The shape of the week comes from how often you check in, not how perfectly. Three signals counts as a day.',
    cta: 'Open Chiwit',
  },
];

function id(prefix: string): string {
  if ('randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    pulse.overall >= 80 ? 'Life feels open today.' :
    pulse.overall >= 62 ? 'A steady day is forming.' :
    pulse.overall >= 45 ? 'Gentle attention helps today.' :
    'Keep the bar kind and small.',
  );

  const sorted = (Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>)
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
    sentences.push(`${dayEntries.length} signal${dayEntries.length === 1 ? '' : 's'} logged so far. The shape comes from how steady the week feels, not any single day.`);
  }

  return sentences.join(' ');
}

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

  const foundations = average([hydration].filter((value): value is number => value !== null)) ?? 45;
  const recovery = average([sleep, mindful].filter((value): value is number => value !== null)) ?? 45;
  const move = movement ?? 45;
  const mind = average([mood, energy].filter((value): value is number => value !== null)) ?? 45;
  const bodyScore = body ?? 45;
  const breakdown = {
    foundations: Math.round(foundations),
    recovery: Math.round(recovery),
    movement: Math.round(move),
    mind: Math.round(mind),
    body: Math.round(bodyScore),
  };
  const overall = Math.round(average(Object.values(breakdown)) ?? 45);
  return {
    overall,
    breakdown,
    message:
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

function generateInsights(state: ChiwitState): Insight[] {
  const insights: Insight[] = [];
  const last7 = Array.from({ length: 7 }, (_, index) => addDays(-index));
  const hydrationDays = last7.map((date) => entriesForDate(state.entries, date).filter((entry) => entry.kind === 'hydration').reduce((sum, entry) => sum + (entry.amount ?? 0), 0));
  const movementDays = last7.map((date) => entriesForDate(state.entries, date).filter((entry) => entry.kind === 'movement').reduce((sum, entry) => sum + (entry.amount ?? 0), 0));
  const moodDays = last7.map((date) => average(entriesForDate(state.entries, date).filter((entry) => entry.kind === 'mood').map((entry) => entry.value)));
  const energyDays = last7.map((date) => average(entriesForDate(state.entries, date).filter((entry) => entry.kind === 'energy').map((entry) => entry.value)));

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
  const localNavigation = useMemo(() => createLocalNavigation<Tab>('today', setTab), []);

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
      return { date, pulse: p.overall, signalCount: entriesForDate(state.entries, date).length };
    });
    const factors: Array<{ label: string; value: number }> = [
      { label: 'Foundations', value: pulse.breakdown.foundations },
      { label: 'Recovery',    value: pulse.breakdown.recovery },
      { label: 'Movement',    value: pulse.breakdown.movement },
      { label: 'Mind',        value: pulse.breakdown.mind },
      { label: 'Body',        value: pulse.breakdown.body },
    ];
    const totalSignals = last7.reduce((sum, d) => sum + entriesForDate(state.entries, d).length, 0);
    const pulseAvg = average(dayShapes.map((d) => d.pulse)) ?? pulse.overall;
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
    void localNavigation.navigate(next, { kind: 'crossfade' });
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
  }

  function removeEntry(entryId: string): void {
    setState((prev) => ({ ...prev, entries: prev.entries.filter((entry) => entry.id !== entryId) }));
    shippie.feel.texture('delete');
  }

  function wipe(): void {
    if (!window.confirm('Clear Chiwit data on this device?')) return;
    const fresh = emptyState();
    setState(fresh);
    writeState(fresh);
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
      <OnboardingFlow appSlug="chiwit" version={1} slides={ONBOARDING_SLIDES} />
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
          entries={todayEntries}
          insights={insights}
          onQuickLog={quickLog}
          onDismissInsight={dismissInsight}
          onNavigate={navigate}
        />
      ) : null}

      {tab === 'track' ? (
        <TrackView
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
        />
      ) : null}

      {tab === 'data' ? (
        <DataView state={state} onWipe={wipe} onShareWeek={openWeekShare} />
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

function TodayView({
  pulse,
  reading,
  entries,
  insights,
  onQuickLog,
  onDismissInsight,
  onNavigate,
}: {
  pulse: PulseScore;
  reading: string;
  entries: PulseEntry[];
  insights: Insight[];
  onQuickLog: (action: QuickAction) => void;
  onDismissInsight: (id: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <section className="page-shell today-shell">
      <div className="hero-plane">
        <div>
          <p className="eyebrow">Today · Daily Pulse</p>
          <h1>Log one signal. Read the day.</h1>
          <p className="reading">{reading}</p>
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
              <small>{action.helper}</small>
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
            />
          ) : null}
        </aside>
      </section>
    </section>
  );
}

function TrackView({
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
          <h1>Log what you feel.</h1>
        </div>
      </div>
      <div className="form-layout">
        <form className="tracking-form" onSubmit={onSaveCheckin}>
          <h2>Daily check-in</h2>
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
              Mood
              <input value={checkin.mood} min={1} max={5} type="range" onChange={(event) => onCheckin({ ...checkin, mood: event.target.value })} />
            </label>
            <label>
              Energy
              <input value={checkin.energy} min={1} max={5} type="range" onChange={(event) => onCheckin({ ...checkin, energy: event.target.value })} />
            </label>
            <label>
              Body
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
              Score
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
    return (
      <section className="page-shell">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Patterns</p>
            <h1>Find the shape of the week.</h1>
          </div>
        </div>
        <EmptyState
          eyebrow="Patterns"
          headline={<>Five signals across <em>three days</em> will show your shape.</>}
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
          <h1>Find the shape of the week.</h1>
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
          />
        ) : insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} onDismiss={onDismissInsight} />
        ))}
      </div>
      <section className="week-ribbon" aria-label="Fourteen day pulse">
        {Array.from({ length: 14 }, (_, index) => {
          const date = addDays(index - 13);
          const score = computePulse(state, date).overall;
          return <span key={date} title={`${formatDate(date)}: ${score}`} style={{ height: `${Math.max(14, score)}%` }} />;
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
}: {
  state: ChiwitState;
  days: string[];
  availableMonths: string[];
  activeMonth: string;
  onMonthChange: (next: string) => void;
  onRemove: (entryId: string) => void;
}) {
  if (state.entries.length === 0) {
    return (
      <section className="page-shell">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Timeline</p>
            <h1>Your recent rhythm.</h1>
          </div>
        </div>
        <EmptyState
          eyebrow="Timeline"
          headline="Your first week opens here."
        />
      </section>
    );
  }
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Timeline</p>
          <h1>Your recent rhythm.</h1>
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
        {days.map((date) => {
          const entries = entriesForDate(state.entries, date).sort((a, b) => b.createdAt - a.createdAt);
          const pulse = computePulse(state, date);
          return (
            <section className="timeline-day" key={date}>
              <header>
                <h2>{formatDate(date)}</h2>
                <strong>{pulse.overall}</strong>
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
      <h1>No Chiwit account. No health cloud.</h1>
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

      <button type="button" className="danger" onClick={onWipe}>Clear this device</button>
    </section>
  );
}

function PulseRing({ pulse }: { pulse: PulseScore }) {
  const factors = Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>;
  return (
    <section className="pulse-card" aria-label={`Daily Pulse ${pulse.overall}`}>
      <div className="pulse-ring" style={{ '--score': pulse.overall } as CSSProperties}>
        <img src={CHIWIT_LOGO_URL} alt="" />
        <strong>{pulse.overall}</strong>
        <span>Daily Pulse</span>
        <small>{pulse.message}</small>
      </div>
      <div className="pulse-factors" aria-label="Pulse factors">
        {factors.map(([key, value]) => (
          <span key={key}>
            <i style={{ inlineSize: `${Math.max(18, value)}%` }} />
            <strong>{key}</strong>
          </span>
        ))}
      </div>
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
