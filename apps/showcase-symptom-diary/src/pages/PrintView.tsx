/**
 * PrintView — the doctor handoff. Optimised for browser-native print
 * (iOS Safari / Android Chrome both render this to "Save as PDF" via
 * the OS print dialog).
 *
 * Layout the secretary expects:
 *   1. Title block + date range + generated-on stamp
 *   2. Symptom intensity chart per symptom
 *   3. Medication timeline (active meds only)
 *   4. Chronological log table
 *
 * Print CSS in styles.css forces ink-friendly black-on-white in
 * `@media print` — nothing here makes layout assumptions about colour.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Entry, MedDose, Medication, Symptom } from '../db/schema.ts';
import { IntensityChart } from '../components/IntensityChart.tsx';
import { MedTimeline, type MedTimelineSeries } from '../components/MedTimeline.tsx';
import { binDosesByDay, buildCharts, lastNDays, toLocalDay } from '../lib/chart-data.ts';

type Range = 7 | 30 | 90;

interface Props {
  symptoms: Symptom[];
  medications: Medication[];
  loadEntries: (fromIso: string, toIso: string) => Promise<Entry[]>;
  loadDoses: (fromIso: string, toIso: string) => Promise<MedDose[]>;
  onClose: () => void;
}

export function PrintView({ symptoms, medications, loadEntries, loadDoses, onClose }: Props) {
  const [range, setRange] = useState<Range>(30);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [doses, setDoses] = useState<MedDose[]>([]);
  const [generatedAt] = useState(() => new Date());

  const win = useMemo(() => lastNDays(range), [range]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromIso = `${win.from}T00:00:00.000Z`;
      const toIso = `${win.to}T23:59:59.999Z`;
      const [es, ds] = await Promise.all([loadEntries(fromIso, toIso), loadDoses(fromIso, toIso)]);
      if (cancelled) return;
      setEntries(es);
      setDoses(ds);
    })();
    return () => {
      cancelled = true;
    };
  }, [win, loadEntries, loadDoses]);

  const charts = useMemo(
    () => buildCharts(entries, symptoms, win.from, win.to),
    [entries, symptoms, win],
  );

  const activeMeds = useMemo(() => medications.filter((m) => m.active === 1), [medications]);

  const medSeries: MedTimelineSeries[] = useMemo(() => {
    const byMed = new Map<string, MedDose[]>();
    for (const d of doses) {
      const arr = byMed.get(d.medication_id) ?? [];
      arr.push(d);
      byMed.set(d.medication_id, arr);
    }
    return activeMeds.map((m) => {
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
  }, [doses, activeMeds, win]);

  const tooFew = entries.length === 0;

  const print = () => {
    if (tooFew) return;
    window.print?.();
  };

  return (
    <div className="print-page" data-print-root>
      <header className="print-toolbar no-print">
        <div className="print-toolbar-left">
          <button type="button" className="ghost" onClick={onClose}>
            Back
          </button>
        </div>
        <div className="print-toolbar-right">
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
          <button type="button" className="primary" disabled={tooFew} onClick={print}>
            Print
          </button>
        </div>
      </header>

      {tooFew ? (
        <p className="error no-print">
          Couldn't generate the PDF — not enough entries in this range. Add at least one log to export.
        </p>
      ) : null}

      <article className="print-doc">
        <header className="print-header">
          <h1>Symptom Diary</h1>
          <div className="print-meta">
            <div>
              <strong>Date range:</strong> {formatDate(win.from)} — {formatDate(win.to)}
            </div>
            <div>
              <strong>Generated:</strong> {generatedAt.toLocaleString()}
            </div>
            <div className="muted small">
              Recorded by the patient. The app does not interpret or diagnose.
            </div>
          </div>
        </header>

        <section className="print-section">
          <h2>Symptom intensity</h2>
          {charts.length === 0 ? (
            <p className="empty">No tracked symptoms.</p>
          ) : (
            <div className="charts">
              {charts.map((c) => (
                <IntensityChart key={c.symptomId} chart={c} />
              ))}
            </div>
          )}
        </section>

        {medSeries.length > 0 ? (
          <section className="print-section">
            <h2>Medications</h2>
            <ul className="med-summary">
              {activeMeds.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong>
                  {m.dose ? <span> · {m.dose}</span> : null}
                  {m.schedule_text ? <span> · {m.schedule_text}</span> : null}
                </li>
              ))}
            </ul>
            <MedTimeline series={medSeries} />
          </section>
        ) : null}

        <section className="print-section">
          <h2>Log</h2>
          {entries.length === 0 ? (
            <p className="empty">No entries yet.</p>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Symptom</th>
                  <th>Intensity</th>
                  <th>Note</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const sym = symptoms.find((s) => s.id === e.symptom_id);
                  const day = toLocalDay(e.occurred_at);
                  const time = new Date(e.occurred_at).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const intensity =
                    sym?.default_scale === 'present-absent'
                      ? e.intensity > 0
                        ? 'present'
                        : 'absent'
                      : `${e.intensity}/5`;
                  return (
                    <tr key={e.id}>
                      <td>{day}</td>
                      <td>{time}</td>
                      <td>{sym?.name ?? 'Symptom'}</td>
                      <td>{intensity}</td>
                      <td>{e.note ?? ''}</td>
                      <td>{e.trigger_text ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <footer className="print-footer muted small">
          Symptom Diary — local-first. The PDF you generate is yours to share — or not.
        </footer>
      </article>
    </div>
  );
}

function formatDate(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
