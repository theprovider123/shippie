/**
 * Predict — explicit prediction page. The voice doc framing is
 * load-bearing here: this is a tool, not an oracle. Range honesty is
 * baked in (RangePill component enforces it).
 *
 * Two ranges shown:
 *   1. Predicted next period (mean ± stddev with floors and caps).
 *   2. Fertile window (≈14 days before predicted start, 5d before -
 *      1d after = 6-day inner window). Same uncertainty propagates to
 *      an outer envelope.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { RangePill } from '../components/RangePill.tsx';
import { listCycles, listDays } from '../db/queries.ts';
import { fertileWindowFor, predictNextCycle } from '../lib/predict.ts';
import { detectPatterns } from '../lib/insights.ts';
import type { Cycle, Day } from '../db/schema.ts';

export interface PredictProps {
  db: ShippieLocalDb;
  refreshKey: number;
}

export function Predict({ db, refreshKey }: PredictProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listCycles(db), listDays(db)]).then(([c, d]) => {
      if (cancelled) return;
      setCycles(c);
      setDays(d);
    });
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  const prediction = useMemo(() => predictNextCycle(cycles), [cycles]);
  const fertile = useMemo(() => fertileWindowFor(prediction), [prediction]);
  const patterns = useMemo(() => detectPatterns(cycles, days), [cycles, days]);

  return (
    <section className="page predict">
      <header className="page-head">
        <p className="eyebrow">Predict & patterns</p>
        <h1>What your logs show</h1>
        <p className="muted">
          Patterns from your own records, on this device. Co-occurrence, not cause. Predictions are ranges,
          never single dates — a tool, not an oracle.
        </p>
      </header>

      {patterns.length > 0 ? (
        <article className="predict-card insights-card">
          <h2>Your patterns</h2>
          <ul className="insight-list">
            {patterns.map((p) => (
              <li key={p.id} className={`insight insight-${p.confidence}`}>
                <span className="insight-dot" aria-hidden="true" />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <article className="predict-card muted-banner">
          <h2>Patterns build with time</h2>
          <p className="muted">A couple of logged cycles and a few symptom days, and personal patterns appear here — pain and mood by cycle day, variability, and more.</p>
        </article>
      )}

      {!prediction ? (
        <article className="predict-card muted-banner">
          <h2>Predictions need a few cycles</h2>
          <p className="muted">Log a few period starts and a predicted range appears here. Until then, predicting would just be guessing on too little signal.</p>
        </article>
      ) : (
        <>

      <article className="predict-card">
        <h2>Next period</h2>
        <RangePill range={prediction.range} confidence={prediction.confidence} />
        <p className="muted">
          Predicted from {prediction.sampleSize} {prediction.sampleSize === 1 ? 'cycle' : 'cycles'}. Mean{' '}
          {Math.round(prediction.mean)} days. Variation ±{prediction.stddev.toFixed(1)} days.
        </p>
      </article>

      {fertile ? (
        <article className="predict-card">
          <h2>Fertile window</h2>
          <RangePill range={fertile.range} />
          <p className="muted">
            Best-guess window: 5 days before predicted ovulation through 1 day after. Outer envelope (with the
            same uncertainty as the period prediction): {fertile.outerRange[0]} - {fertile.outerRange[1]}.
            The app shows the window. It doesn't say what to do with it.
          </p>
        </article>
      ) : null}

      <article className="predict-card disclaimer">
        <h2>About these numbers</h2>
        <p>
          The prediction reads your past cycle lengths and reports the mean and the variance. A wider range
          means recent cycles have varied more. Stress, illness, travel, sleep, breastfeeding, hormonal shifts,
          and a hundred other things move the date around. Use this as one input, not the input.
        </p>
      </article>
        </>
      )}
    </section>
  );
}
