/**
 * History — daily / weekly / monthly view of symptom intensity, with
 * the medication-dose timeline overlaid.
 *
 * The chart deliberately does NOT smooth or interpolate. The doctor
 * looks for spikes; we show peaks-per-day. Empty days are visible.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Entry, MedDose, Medication, Symptom } from '../db/schema.ts';
import { IntensityChart } from '../components/IntensityChart.tsx';
import { MedTimeline, type MedTimelineSeries } from '../components/MedTimeline.tsx';
import {
  binDosesByDay,
  buildCharts,
  lastNDays,
  toLocalDay,
} from '../lib/chart-data.ts';

type Range = 7 | 30 | 90;

interface Props {
  symptoms: Symptom[];
  medications: Medication[];
  loadEntries: (fromIso: string, toIso: string) => Promise<Entry[]>;
  loadDoses: (fromIso: string, toIso: string) => Promise<MedDose[]>;
  onPrint: () => void;
}

export function History({ symptoms, medications, loadEntries, loadDoses, onPrint }: Props) {
  const [range, setRange] = useState<Range>(30);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [doses, setDoses] = useState<MedDose[]>([]);
  const [loading, setLoading] = useState(false);

  const win = useMemo(() => lastNDays(range), [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fromIso = `${win.from}T00:00:00.000Z`;
      const toIso = `${win.to}T23:59:59.999Z`;
      const [es, ds] = await Promise.all([loadEntries(fromIso, toIso), loadDoses(fromIso, toIso)]);
      if (cancelled) return;
      setEntries(es);
      setDoses(ds);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [win, loadEntries, loadDoses]);

  const charts = useMemo(
    () => buildCharts(entries, symptoms, win.from, win.to),
    [entries, symptoms, win],
  );

  const medSeries: MedTimelineSeries[] = useMemo(() => {
    const byMed = new Map<string, MedDose[]>();
    for (const d of doses) {
      const arr = byMed.get(d.medication_id) ?? [];
      arr.push(d);
      byMed.set(d.medication_id, arr);
    }
    return medications.map((m) => {
      const own = byMed.get(m.id) ?? [];
      return {
        medicationId: m.id,
        medicationName: m.name,
        dose: m.dose ?? null,
        schedule: m.schedule_text ?? null,
        bins: binDosesByDay(own, win.from, win.to),
        total: own.length,
      };
    });
  }, [doses, medications, win]);

  const totalEntries = entries.length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Last {range} days</h1>
        </div>
        <button type="button" className="primary" onClick={onPrint} disabled={totalEntries === 0}>
          Export for doctor
        </button>
      </header>

      <div className="range-tabs" role="tablist">
        {([7, 30, 90] as const).map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={range === n}
            className={`range-tab ${range === n ? 'range-tab-active' : ''}`}
            onClick={() => setRange(n)}
          >
            {n === 7 ? 'Week' : n === 30 ? 'Month' : '3 months'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading entries…</p>
      ) : totalEntries === 0 ? (
        <p className="empty">No entries yet.</p>
      ) : (
        <>
          <section className="section">
            <h2 className="section-title">Symptom intensity</h2>
            <div className="charts">
              {charts.map((c) => (
                <IntensityChart key={c.symptomId} chart={c} />
              ))}
            </div>
          </section>

          {medSeries.some((m) => m.total > 0) ? (
            <section className="section">
              <h2 className="section-title">Medication doses</h2>
              <MedTimeline series={medSeries} />
            </section>
          ) : null}

          <section className="section">
            <h2 className="section-title">Log</h2>
            <ul className="entry-list">
              {[...entries].reverse().map((e) => (
                <EntryRow key={e.id} entry={e} symptoms={symptoms} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function EntryRow({ entry, symptoms }: { entry: Entry; symptoms: Symptom[] }) {
  const symptom = symptoms.find((s) => s.id === entry.symptom_id);
  const day = toLocalDay(entry.occurred_at);
  const time = new Date(entry.occurred_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <li className="entry-row">
      <div className="entry-row-when">
        <div className="entry-row-day">{day}</div>
        <div className="entry-row-time muted small">{time}</div>
      </div>
      <div className="entry-row-body">
        <div className="entry-row-name">
          <strong>{symptom?.name ?? 'Symptom'}</strong>
          <span className="entry-row-intensity">
            {symptom?.default_scale === 'present-absent'
              ? entry.intensity > 0
                ? 'present'
                : 'absent'
              : `${entry.intensity}/5`}
          </span>
        </div>
        {entry.note ? <div className="entry-row-note">{entry.note}</div> : null}
        {entry.trigger_text ? (
          <div className="entry-row-trigger muted small">Trigger: {entry.trigger_text}</div>
        ) : null}
      </div>
    </li>
  );
}
