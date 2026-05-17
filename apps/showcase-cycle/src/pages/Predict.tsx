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
import { listCycles } from '../db/queries.ts';
import { fertileWindowFor, predictNextCycle } from '../lib/predict.ts';
import type { Cycle } from '../db/schema.ts';

export interface PredictProps {
  db: ShippieLocalDb;
  refreshKey: number;
}

export function Predict({ db, refreshKey }: PredictProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listCycles(db).then((rows) => {
      if (!cancelled) setCycles(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  const prediction = useMemo(() => predictNextCycle(cycles), [cycles]);
  const fertile = useMemo(() => fertileWindowFor(prediction), [prediction]);

  if (!prediction) {
    return (
      <section className="page predict">
        <header className="page-head">
          <p className="eyebrow">Predict</p>
          <h1>Not enough data</h1>
        </header>
        <p>
          Predictions kick in once three full cycles are logged. Until then, this page would just be making
          guesses on too little signal.
        </p>
      </section>
    );
  }

  return (
    <section className="page predict">
      <header className="page-head">
        <p className="eyebrow">Predict</p>
        <h1>Next windows</h1>
        <p className="muted">
          Cycles vary. The app shows ranges, not single dates. This is a tool, not an oracle.
        </p>
      </header>

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
    </section>
  );
}
