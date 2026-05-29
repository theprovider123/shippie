/**
 * Today — the 5-second daily log + the day's prediction.
 *
 * Full field set: flow, pain, mood, energy, discharge (cervical fluid),
 * medications, optional intimacy, symptom toggles, and a freeform note. Each
 * field is a tap-chip row (tap-again-to-clear), so a complete log is seconds,
 * and a partial log is fine — nothing is required.
 *
 * Mode-aware: fertility framing (discharge, intimacy emphasis) only appears in
 * fertility-aware / TTC modes; copy stays gender-neutral when that pref is on.
 *
 * Voice doc: predictions are ALWAYS a range, never a single certain date.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { FlowPicker } from '../components/FlowPicker.tsx';
import { SymptomToggles } from '../components/SymptomToggles.tsx';
import { ChipScale, ChipMulti } from '../components/ChipScale.tsx';
import { RangePill } from '../components/RangePill.tsx';
import {
  cycleDayFor,
  getActiveCycle,
  getDayByDate,
  isoDate,
  listCycles,
  loadPrefs,
  logDay,
  parseStringArray,
  parseSymptoms,
  startCycle,
} from '../db/queries.ts';
import { daysUntil, predictNextCycle } from '../lib/predict.ts';
import {
  DISCHARGE_LABELS,
  DISCHARGE_OPTIONS,
  ENERGY_LABELS,
  MODE_META,
  MOOD_LABELS,
  PAIN_LABELS,
  SEX_LABELS,
  SEX_OPTIONS,
  type Cycle,
  type Discharge,
  type Flow,
  type Mode,
  type Pain,
  type Scale5,
  type SexEntry,
  type SymptomKey,
} from '../db/schema.ts';

export interface LoggedEntry {
  cycle_id: string;
  date: string;
  flow: Flow | null;
  pain: Pain | null;
  mood: Scale5 | null;
  energy: Scale5 | null;
  discharge: Discharge | null;
  meds: string[];
  sex: SexEntry[];
  symptoms: SymptomKey[];
  note: string | null;
  fresh_cycle: boolean;
}

export interface TodayProps {
  db: ShippieLocalDb;
  refreshKey: number;
  onChange: () => void;
  onLogged: (entry: LoggedEntry) => void;
  onMoodCorrelation: (note: string | null) => void;
  moodCorrelationHint: string | null;
}

const PAIN_OPTS = ([0, 1, 2, 3] as Pain[]).map((v) => ({ value: v, label: PAIN_LABELS[v] }));
const SCALE5: Scale5[] = [1, 2, 3, 4, 5];
const MOOD_OPTS = SCALE5.map((v) => ({ value: v, label: MOOD_LABELS[v] }));
const ENERGY_OPTS = SCALE5.map((v) => ({ value: v, label: ENERGY_LABELS[v] }));
const DISCHARGE_OPTS = DISCHARGE_OPTIONS.map((v) => ({ value: v, label: DISCHARGE_LABELS[v] }));
const SEX_OPTS = SEX_OPTIONS.map((v) => ({ value: v, label: SEX_LABELS[v] }));

export function Today({ db, refreshKey, onChange, onLogged, moodCorrelationHint }: TodayProps) {
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);
  const [allCycles, setAllCycles] = useState<Cycle[]>([]);
  const [dayNum, setDayNum] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('period-only');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [pain, setPain] = useState<Pain | null>(null);
  const [mood, setMood] = useState<Scale5 | null>(null);
  const [energy, setEnergy] = useState<Scale5 | null>(null);
  const [discharge, setDischarge] = useState<Discharge | null>(null);
  const [meds, setMeds] = useState('');
  const [sex, setSex] = useState<SexEntry[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomKey[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const today = isoDate();
  const meta = MODE_META[mode];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [active, cycles, prefs] = await Promise.all([
        getActiveCycle(db),
        listCycles(db),
        loadPrefs(db),
      ]);
      if (cancelled) return;
      setActiveCycle(active);
      setAllCycles(cycles);
      setMode(prefs.mode);
      const dnum = await cycleDayFor(db, today);
      if (cancelled) return;
      setDayNum(dnum);
      const existing = active ? await getDayByDate(db, today) : null;
      if (cancelled) return;
      setFlow((existing?.flow ?? null) as Flow | null);
      setPain((existing?.pain ?? null) as Pain | null);
      setMood((existing?.mood ?? null) as Scale5 | null);
      setEnergy((existing?.energy ?? null) as Scale5 | null);
      setDischarge((existing?.discharge ?? null) as Discharge | null);
      setMeds(parseStringArray(existing?.meds_json ?? null).join(', '));
      setSex(parseStringArray(existing?.sex_json ?? null) as SexEntry[]);
      setSymptoms(parseSymptoms(existing?.symptoms_json ?? null));
      setNote(existing?.note ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey, today]);

  const prediction = useMemo(() => (meta.predict ? predictNextCycle(allCycles) : null), [allCycles, meta.predict]);
  const until = prediction ? daysUntil(prediction, today) : null;
  const medsList = useMemo(
    () => meds.split(',').map((m) => m.trim()).filter(Boolean),
    [meds],
  );

  async function persist(freshCycle: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const cycle = freshCycle || !activeCycle ? await startCycle(db, today) : activeCycle;
      const effectiveFlow = freshCycle && flow == null ? (2 as Flow) : flow;
      await logDay(db, {
        cycle_id: cycle.id,
        date: today,
        flow: effectiveFlow,
        pain,
        mood,
        energy,
        discharge: meta.fertility ? discharge : null,
        meds: medsList,
        sex,
        symptoms,
        note: note.trim() || null,
      });
      setSavedAt(Date.now());
      onLogged({
        cycle_id: cycle.id,
        date: today,
        flow: effectiveFlow,
        pain,
        mood,
        energy,
        discharge: meta.fertility ? discharge : null,
        meds: medsList,
        sex,
        symptoms,
        note: note.trim() || null,
        fresh_cycle: freshCycle || !activeCycle,
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page today">
      <header className="page-head">
        <p className="eyebrow">Today</p>
        <h1>{dayNum ? `Day ${dayNum}` : 'No active cycle'}</h1>
        {activeCycle ? (
          <p className="muted">Cycle started {activeCycle.started_on}. · {meta.label}</p>
        ) : (
          <p className="muted">Nothing logged yet. {meta.label} mode.</p>
        )}
      </header>

      {moodCorrelationHint ? (
        <aside className="hint">
          <strong>From your mood log:</strong> {moodCorrelationHint}{' '}
          <small>This might be a coincidence — single signal, small sample.</small>
        </aside>
      ) : null}

      <div className="quick-log">
        <FlowPicker value={flow} onChange={setFlow} />
        <ChipScale legend="Pain" options={PAIN_OPTS} value={pain} onChange={setPain} />
        <ChipScale legend="Mood" options={MOOD_OPTS} value={mood} onChange={setMood} hint="optional" />
        <ChipScale legend="Energy" options={ENERGY_OPTS} value={energy} onChange={setEnergy} hint="optional" />
        {meta.fertility ? (
          <ChipScale
            legend="Discharge"
            options={DISCHARGE_OPTS}
            value={discharge}
            onChange={setDischarge}
            hint="cervical fluid"
          />
        ) : null}
        <SymptomToggles selected={symptoms} onChange={setSymptoms} />
        <label className="note-field">
          <span className="field-label">Medication</span>
          <input
            value={meds}
            onChange={(e) => setMeds(e.target.value)}
            placeholder="e.g. ibuprofen, the pill — comma separated"
            inputMode="text"
          />
        </label>
        <ChipMulti legend="Sex" options={SEX_OPTS} selected={sex} onChange={setSex} hint="optional, private" />
        <label className="note-field">
          <span className="field-label">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering — sleep, exercise, food, stress."
            rows={2}
          />
        </label>
        <div className="quick-actions actions">
          <button type="button" className="primary" onClick={() => void persist(false)} disabled={busy}>
            Log today
          </button>
          <button type="button" className="secondary" onClick={() => void persist(true)} disabled={busy}>
            {activeCycle ? 'Period started today' : 'Start a new cycle'}
          </button>
        </div>
        {savedAt ? <p className="saved-flag">Saved — on this device only.</p> : null}
      </div>

      {meta.predict ? (
        prediction ? (
          <section className="predict-banner" aria-label="Predicted next period">
            <p className="eyebrow">Predicted next period</p>
            <RangePill
              range={prediction.range}
              confidence={prediction.confidence}
              label={
                until && until.earliest > 0
                  ? `in ${until.earliest}-${Math.max(until.earliest, until.latest)} days`
                  : 'around now'
              }
            />
            <p className="muted">
              A prediction, not a certainty. Based on {prediction.sampleSize}{' '}
              {prediction.sampleSize === 1 ? 'cycle' : 'cycles'} (mean {Math.round(prediction.mean)}d, ±
              {prediction.stddev.toFixed(1)}d). Cycles vary.
            </p>
          </section>
        ) : (
          <section className="predict-banner muted-banner" aria-label="Predicted next period">
            <p className="eyebrow">Predicted next period</p>
            <p>Not enough data yet. Log a few cycle starts and a range will appear here — always a range, never a single date.</p>
          </section>
        )
      ) : (
        <section className="predict-banner muted-banner" aria-label="Prediction paused">
          <p className="eyebrow">Prediction</p>
          <p>Paused in {meta.label} mode. Logging still works — symptoms, notes, and history are all kept.</p>
        </section>
      )}
    </section>
  );
}
