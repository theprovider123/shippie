/**
 * PrintView — clinician handoff via the browser's native print pipeline.
 *
 * No PDF library, no server. The print stylesheet does the work; the
 * user gets the OS print dialog and can save-as-PDF if they want.
 *
 * Voice doc: this is a record. Plain rows, plain numbers, no graphics
 * that don't render in monochrome.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { listCycles, listDays, parseSymptoms, summariseCycle } from '../db/queries.ts';
import { formatRange, predictNextCycle } from '../lib/predict.ts';
import type { Cycle, Day } from '../db/schema.ts';
import type { CycleSummary } from '../db/queries.ts';

export interface PrintViewProps {
  db: ShippieLocalDb;
  refreshKey: number;
}

export function PrintView({ db, refreshKey }: PrintViewProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [summaries, setSummaries] = useState<CycleSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await listCycles(db);
      if (cancelled) return;
      setCycles(all);
      const allDays = await listDays(db);
      if (cancelled) return;
      setDays(allDays);
      const sums: CycleSummary[] = [];
      for (const c of all) {
        const s = await summariseCycle(db, c.id);
        if (s) sums.push(s);
      }
      if (!cancelled) setSummaries(sums);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  const prediction = useMemo(() => predictNextCycle(cycles), [cycles]);

  const symptomTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of summaries) {
      for (const [k, v] of Object.entries(s.symptomFrequency)) {
        totals[k] = (totals[k] ?? 0) + v;
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [summaries]);

  return (
    <section className="page print-view">
      <header className="page-head no-print">
        <p className="eyebrow">Print</p>
        <h1>Clinician handoff</h1>
        <p className="muted">
          Plain print view. Open the system print dialog and save-as-PDF if a digital copy is needed. Nothing
          leaves this device.
        </p>
        <button type="button" onClick={() => window.print()} className="primary">
          Open print dialog
        </button>
      </header>

      <article className="printable">
        <header className="print-header">
          <h2>Cycle summary</h2>
          <p>Generated {new Date().toLocaleString()}. Source: this device only.</p>
        </header>

        <section>
          <h3>Predicted next period</h3>
          {prediction ? (
            <p>
              {formatRange(prediction.range)} (mean {Math.round(prediction.mean)}d, stddev{' '}
              {prediction.stddev.toFixed(1)}d, confidence {prediction.confidence}, sample{' '}
              {prediction.sampleSize}).
            </p>
          ) : (
            <p>Not enough data — fewer than three full cycles logged.</p>
          )}
        </section>

        <section>
          <h3>Cycle history</h3>
          {cycles.length === 0 ? (
            <p>No cycles logged yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Length (d)</th>
                  <th>Days logged</th>
                  <th>Top symptoms</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const top = Object.entries(s.symptomFrequency)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([k, v]) => `${k} (${v})`)
                    .join(', ');
                  return (
                    <tr key={s.cycle.id}>
                      <td>{s.cycle.started_on}</td>
                      <td>{s.cycle.length_days ?? '-'}</td>
                      <td>{s.dayCount}</td>
                      <td>{top || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3>Symptom frequency (all cycles)</h3>
          {symptomTotals.length === 0 ? (
            <p>No symptoms logged.</p>
          ) : (
            <ul>
              {symptomTotals.map(([k, v]) => (
                <li key={k}>
                  {k.replace('-', ' ')}: {v}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Day-by-day log</h3>
          {days.length === 0 ? (
            <p>No days logged yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Flow</th>
                  <th>Symptoms</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const symptoms = parseSymptoms(d.symptoms_json ?? null).join(', ');
                  return (
                    <tr key={d.id}>
                      <td>{d.date}</td>
                      <td>{typeof d.flow === 'number' ? d.flow : '-'}</td>
                      <td>{symptoms || '-'}</td>
                      <td>{d.note ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <footer className="print-footer">
          <small>
            Generated by Cycle on Shippie. Local-only record. Predictions are statistical, not diagnostic.
          </small>
        </footer>
      </article>
    </section>
  );
}
