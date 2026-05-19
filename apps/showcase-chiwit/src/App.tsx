import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { createShippieIframeSdk, type IntentBroadcast } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'track', label: 'Track' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'data', label: 'Data' },
];

const KIND_META: Record<EntryKind, { label: string; color: string; unit: string }> = {
  mood: { label: 'Mood', color: '#F97066', unit: '/5' },
  energy: { label: 'Energy', color: '#FF9800', unit: '/5' },
  sleep: { label: 'Sleep', color: '#9575CD', unit: 'h' },
  hydration: { label: 'Hydration', color: '#42A5F5', unit: 'ml' },
  movement: { label: 'Movement', color: '#66BB6A', unit: 'min' },
  mindful: { label: 'Mindful', color: '#26A69A', unit: 'min' },
  body: { label: 'Body', color: '#8D6E63', unit: '/5' },
  weight: { label: 'Body metrics', color: '#A5D6A7', unit: 'kg' },
};

const QUICK_ACTIONS: QuickAction[] = [
  { kind: 'hydration', label: '+250 ml', value: 1, amount: 250, unit: 'ml', note: 'water' },
  { kind: 'mood', label: 'Mood good', value: 4, note: 'steady' },
  { kind: 'energy', label: 'Energy okay', value: 3, note: 'steady' },
  { kind: 'sleep', label: '7.5h sleep', value: 4, amount: 7.5, unit: 'h' },
  { kind: 'movement', label: '20 min walk', value: 3, amount: 20, unit: 'min' },
  { kind: 'mindful', label: '5 min calm', value: 4, amount: 5, unit: 'min' },
  { kind: 'body', label: 'Body okay', value: 3, note: 'okay' },
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
  const localNavigation = useMemo(() => createLocalNavigation<Tab>('today', setTab), []);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  useEffect(() => {
    writeState(state);
  }, [state]);

  useEffect(() => {
    const unsubscribers = [
      shippie.intent.subscribe('cooked-meal', (broadcast) => addExternalSignal(broadcast, 'body', 'Cooked meal')),
      shippie.intent.subscribe('caffeine-logged', (broadcast) => addExternalSignal(broadcast, 'energy', 'Caffeine')),
      shippie.intent.subscribe('coffee-brewed', (broadcast) => addExternalSignal(broadcast, 'energy', 'Coffee')),
      shippie.intent.subscribe('brewed-tea', (broadcast) => addExternalSignal(broadcast, 'mindful', 'Tea ritual')),
      shippie.intent.subscribe('wellness-ritual', (broadcast) => addExternalSignal(broadcast, 'mindful', 'Ritual')),
    ];
    shippie.requestIntent('cooked-meal');
    shippie.requestIntent('caffeine-logged');
    shippie.requestIntent('coffee-brewed');
    shippie.requestIntent('brewed-tea');
    shippie.requestIntent('wellness-ritual');
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const pulse = useMemo(() => computePulse(state), [state]);
  const insights = useMemo(() => generateInsights(state), [state]);
  const todayEntries = entriesForDate(state.entries, today()).sort((a, b) => b.createdAt - a.createdAt);
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(-index)), []);

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

  function addExternalSignal(broadcast: IntentBroadcast, kind: EntryKind, label: string): void {
    if (broadcast.rows.length === 0) return;
    const entry: PulseEntry = {
      id: id('entry'),
      kind,
      date: today(),
      value: kind === 'energy' ? 3 : 4,
      amount: kind === 'mindful' ? 5 : undefined,
      unit: kind === 'mindful' ? 'min' : undefined,
      note: label,
      createdAt: Date.now(),
    };
    setState((prev) => {
      const alreadyLogged = prev.entries.some((candidate) => candidate.note === label && candidate.date === entry.date && Date.now() - candidate.createdAt < 1000 * 60 * 10);
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

  return (
    <main className="chiwit-app">
      <header className="app-header">
        <button className="brand-lockup" type="button" onClick={() => navigate('today')} aria-label="Open Chiwit today">
          <img src="/brand/chiwit-logo.png" alt="" />
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
        <PatternsView state={state} pulse={pulse} insights={insights} onDismissInsight={dismissInsight} />
      ) : null}

      {tab === 'timeline' ? (
        <TimelineView state={state} days={days} onRemove={removeEntry} />
      ) : null}

      {tab === 'data' ? (
        <DataView state={state} onWipe={wipe} />
      ) : null}
    </main>
  );
}

function TodayView({
  pulse,
  entries,
  insights,
  onQuickLog,
  onDismissInsight,
  onNavigate,
}: {
  pulse: PulseScore;
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
          <p className="eyebrow">Chiwit</p>
          <h1>How does life feel today?</h1>
          <p>Tap the signal you notice. Chiwit turns small moments into a pulse you can read.</p>
          <div className="hero-actions">
            <button type="button" className="primary" onClick={() => onNavigate('track')}>Log feeling</button>
            <button type="button" onClick={() => onNavigate('patterns')}>Read pulse</button>
          </div>
        </div>
        <PulseRing pulse={pulse} />
      </div>
      <section className="quick-panel">
        <SectionHeading title="Quick log" action="One tap" />
        <div className="quick-grid" aria-label="Quick log">
          {QUICK_ACTIONS.map((action) => (
            <button key={action.label} type="button" onClick={() => onQuickLog(action)}>
              <span style={{ background: KIND_META[action.kind].color }} />
              <strong>{action.label}</strong>
              <small>{KIND_META[action.kind].label}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="split-layout">
        <div>
          <SectionHeading title="Today" action={`${entries.length} signal${entries.length === 1 ? '' : 's'}`} />
          <EntryList entries={entries.slice(0, 8)} />
        </div>
        <aside className="insight-panel">
          <h2>What Chiwit notices</h2>
          {insights.slice(0, 3).map((insight) => (
            <InsightCard key={insight.id} insight={insight} onDismiss={onDismissInsight} />
          ))}
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
  insights,
  onDismissInsight,
}: {
  state: ChiwitState;
  pulse: PulseScore;
  insights: Insight[];
  onDismissInsight: (id: string) => void;
}) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Patterns</p>
          <h1>Find the shape of the week.</h1>
        </div>
      </div>
      <section className="category-grid">
        {(Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>).map(([key, value]) => (
          <div key={key} className="category-row">
            <strong>{key}</strong>
            <span>{value}</span>
            <meter min={0} max={100} value={value} />
          </div>
        ))}
      </section>
      <div className="insight-grid">
        {insights.map((insight) => <InsightCard key={insight.id} insight={insight} onDismiss={onDismissInsight} />)}
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

function TimelineView({ state, days, onRemove }: { state: ChiwitState; days: string[]; onRemove: (entryId: string) => void }) {
  return (
    <section className="page-shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Timeline</p>
          <h1>Your recent rhythm.</h1>
        </div>
      </div>
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

function DataView({ state, onWipe }: { state: ChiwitState; onWipe: () => void }) {
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
      <button type="button" className="danger" onClick={onWipe}>Clear this device</button>
    </section>
  );
}

function PulseRing({ pulse }: { pulse: PulseScore }) {
  const factors = Object.entries(pulse.breakdown) as Array<[keyof ScoreBreakdown, number]>;
  return (
    <section className="pulse-card" aria-label={`Daily Pulse ${pulse.overall}`}>
      <div className="pulse-ring" style={{ '--score': pulse.overall } as CSSProperties}>
        <img src="/brand/chiwit-logo.png" alt="" />
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
        <li key={entry.id}>
          <span style={{ background: KIND_META[entry.kind].color }} />
          <div>
            <strong>{KIND_META[entry.kind].label}</strong>
            <small>
              {entry.amount ?? entry.value}{entry.unit ?? KIND_META[entry.kind].unit}
              {entry.note ? ` - ${entry.note}` : ''}
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
    <article className={`insight-card ${insight.tone}`}>
      <div>
        <strong>{insight.title}</strong>
        <p>{insight.body}</p>
      </div>
      <button type="button" onClick={() => onDismiss(insight.id)} aria-label="Dismiss insight">×</button>
    </article>
  );
}
