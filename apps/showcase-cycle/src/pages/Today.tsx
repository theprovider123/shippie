/**
 * Today — the main quick-log surface.
 *
 * What's here:
 *   - Day count of the active cycle (e.g. "Day 3").
 *   - Quick-log row: flow + symptoms + free-text note.
 *   - Predicted-next-period banner with range + confidence.
 *   - "Period started today" affordance — opens a fresh cycle.
 *
 * Voice doc rules:
 *   - Predicted date is ALWAYS a range. RangePill enforces this.
 *   - "Period", "cycle", "ovulation". No euphemisms.
 *   - Empty states are plain.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { FlowPicker } from '../components/FlowPicker.tsx';
import { SymptomToggles } from '../components/SymptomToggles.tsx';
import { RangePill } from '../components/RangePill.tsx';
import {
  cycleDayFor,
  getActiveCycle,
  getDayByDate,
  isoDate,
  listCycles,
  logDay,
  parseSymptoms,
  startCycle,
} from '../db/queries.ts';
import { daysUntil, predictNextCycle } from '../lib/predict.ts';
import type { Cycle, Flow, SymptomKey } from '../db/schema.ts';

export interface TodayProps {
  db: ShippieLocalDb;
  refreshKey: number;
  onChange: () => void;
  onLogged: (entry: {
    cycle_id: string;
    date: string;
    flow: Flow | null;
    symptoms: SymptomKey[];
    note: string | null;
  }) => void;
  onMoodCorrelation: (note: string | null) => void;
  moodCorrelationHint: string | null;
}

export function Today({ db, refreshKey, onChange, onLogged, moodCorrelationHint }: TodayProps) {
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);
  const [allCycles, setAllCycles] = useState<Cycle[]>([]);
  const [dayNum, setDayNum] = useState<number | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomKey[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const today = isoDate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [active, cycles] = await Promise.all([getActiveCycle(db), listCycles(db)]);
      if (cancelled) return;
      setActiveCycle(active);
      setAllCycles(cycles);
      const dnum = await cycleDayFor(db, today);
      if (cancelled) return;
      setDayNum(dnum);
      const existing = active ? await getDayByDate(db, today) : null;
      if (cancelled) return;
      if (existing) {
        setFlow((existing.flow ?? null) as Flow | null);
        setSymptoms(parseSymptoms(existing.symptoms_json ?? null));
        setNote(existing.note ?? '');
      } else {
        setFlow(null);
        setSymptoms([]);
        setNote('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey, today]);

  const prediction = useMemo(() => predictNextCycle(allCycles), [allCycles]);
  const until = prediction ? daysUntil(prediction, today) : null;

  async function handleSave(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      let cycle = activeCycle;
      if (!cycle) {
        cycle = await startCycle(db, today);
      }
      await logDay(db, {
        cycle_id: cycle.id,
        date: today,
        flow,
        symptoms,
        note: note.trim() || null,
      });
      setSavedAt(Date.now());
      onLogged({
        cycle_id: cycle.id,
        date: today,
        flow,
        symptoms,
        note: note.trim() || null,
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleStartFresh(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const fresh = await startCycle(db, today);
      await logDay(db, { cycle_id: fresh.id, date: today, flow: flow ?? 2, symptoms, note: note.trim() || null });
      onLogged({
        cycle_id: fresh.id,
        date: today,
        flow: flow ?? 2,
        symptoms,
        note: note.trim() || null,
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
          <p className="muted">Cycle started {activeCycle.started_on}.</p>
        ) : (
          <p className="muted">No cycles logged yet.</p>
        )}
      </header>

      {moodCorrelationHint ? (
        <aside className="hint">
          <strong>Note from Mood:</strong> {moodCorrelationHint}{' '}
          <small>This might be a coincidence — single signal, small sample.</small>
        </aside>
      ) : null}

      <div className="quick-log">
        <FlowPicker value={flow} onChange={setFlow} />
        <SymptomToggles selected={symptoms} onChange={setSymptoms} />
        <label className="note-field">
          <span>Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering — sleep, exercise, food, stress."
            rows={2}
          />
        </label>
        <div className="quick-actions">
          <button type="button" className="primary" onClick={handleSave} disabled={busy}>
            Log today
          </button>
          {!activeCycle ? (
            <button type="button" onClick={handleStartFresh} disabled={busy}>
              Period started today
            </button>
          ) : null}
        </div>
        {savedAt ? <p className="saved-flag">Saved.</p> : null}
      </div>

      {prediction ? (
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
            Based on {prediction.sampleSize} {prediction.sampleSize === 1 ? 'cycle' : 'cycles'} (mean {Math.round(prediction.mean)}d, stddev {prediction.stddev.toFixed(1)}d). Cycles vary; this is a tool, not an oracle.
          </p>
        </section>
      ) : (
        <section className="predict-banner muted-banner" aria-label="Predicted next period">
          <p className="eyebrow">Predicted next period</p>
          <p>Not enough data. Log three full cycles and a prediction will appear here.</p>
        </section>
      )}
    </section>
  );
}
