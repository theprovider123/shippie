/**
 * Pan guide — Maillard browning temp range, smoke point of fats, deglaze
 * pan-sauce flow, sear-then-roast (cast-iron oven transfer).
 */

import { useMemo, useState } from 'react';
import {
  computeCookMinutes,
  DONENESS_LABEL,
  DONENESS_TEMP_C,
  FAT_SMOKE_POINTS,
  formatDuration,
  type Cut,
  type Doneness,
} from '../data.ts';
import { TempCard } from './TempCard.tsx';

const DONENESS_ORDER: Doneness[] = [
  'rare',
  'med-rare',
  'medium',
  'med-well',
  'well-done',
];

interface PanGuideProps {
  cut: Cut;
  doneness: Doneness;
  onDonenessChange(d: Doneness): void;
  onStart(args: { target_c: number; minutes: number }): void;
}

export function PanGuide({ cut, doneness, onDonenessChange, onStart }: PanGuideProps) {
  const timing = cut.timing.pan;
  const [chosenFat, setChosenFat] = useState<string>(suggestFat(cut));

  const targetC = useMemo(() => {
    if (timing?.target_temp_c) return timing.target_temp_c;
    if (cut.donenessApplies) return DONENESS_TEMP_C[doneness];
    return null;
  }, [timing, cut, doneness]);

  const minutes = useMemo(() => computeCookMinutes(cut, 'pan', null), [cut]);

  const chosen = FAT_SMOKE_POINTS.find((f) => f.fat === chosenFat) ?? FAT_SMOKE_POINTS[0]!;
  const fatTooLow = chosen.smoke_point_c < 200;

  if (!timing) {
    return <p className="muted">This one isn’t for the pan.</p>;
  }

  return (
    <section className="guide guide--pan">
      <header className="guide-head">
        <p className="eyebrow">pan</p>
        <h2>Maillard, then deglaze</h2>
        <p className="lede">
          Conduction sear: get the pan hotter than you think, dry the surface,
          single firm contact. Browning starts ~140°C; the smoke point of your
          fat is the ceiling — pick fat to match the heat.
        </p>
      </header>

      {cut.donenessApplies ? (
        <div className="ladder" role="radiogroup" aria-label="Doneness">
          <p className="eyebrow">doneness</p>
          {DONENESS_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === doneness}
              className={`ladder-row ${d === doneness ? 'ladder-row--active' : ''}`}
              onClick={() => onDonenessChange(d)}
            >
              <span className="ladder-temp">{DONENESS_TEMP_C[d]}°C</span>
              <span className="ladder-label">{DONENESS_LABEL[d]}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="metric-grid">
        <Metric eyebrow="pan" big="220°C+" sub="hot before fat hits" />
        <Metric eyebrow="internal" big={targetC ? `${targetC}°C` : '—'} />
        <Metric
          eyebrow="cook"
          big={minutes ? formatDuration(minutes) : '—'}
          sub={timing.per_side_minutes ? `${timing.per_side_minutes} min/side` : undefined}
        />
      </div>

      <TempCard cut={cut} expanded />

      <div className="fat">
        <p className="eyebrow">fat</p>
        <div className="fat-grid">
          {FAT_SMOKE_POINTS.map((f) => (
            <button
              key={f.fat}
              type="button"
              className={`fat-chip ${f.fat === chosenFat ? 'fat-chip--active' : ''}`}
              onClick={() => setChosenFat(f.fat)}
            >
              <span className="fat-name">{f.fat}</span>
              <span className="fat-temp">{f.smoke_point_c}°C</span>
            </button>
          ))}
        </div>
        <p className={`fat-feedback ${fatTooLow ? 'fat-feedback--warn' : ''}`}>
          {fatTooLow
            ? `${chosen.fat} (${chosen.smoke_point_c}°C) is fine for medium heat — finish-baste only. For a hard sear, switch to avocado oil, ghee, or refined neutrals.`
            : chosen.use}
        </p>
      </div>

      {timing.note ? <p className="callout">{timing.note}</p> : null}

      <ul className="bullets">
        <li>
          <strong>Sear-then-roast:</strong> sear all sides in a cast-iron pan,
          slide pan into 175°C oven to finish thick cuts evenly without burning
          the crust. The classic restaurant move for ribeye and chops.
        </li>
        <li>
          <strong>Deglaze for sauce:</strong> after pulling the protein, kill
          excess fat, splash wine / stock, scrape the fond, reduce, finish with
          cold butter off heat. Three minutes; no other source of flavour
          works as hard.
        </li>
        <li>
          <strong>Don’t crowd:</strong> protein in batches if the pan looks
          full. Steam beats sear when surface area shrinks.
        </li>
        <li>
          <strong>Butter-baste at the end:</strong> add butter, garlic, thyme
          in the last 60s, tilt pan, spoon foam over the protein. Adds flavour
          without subjecting butter to the full sear.
        </li>
      </ul>

      <button
        type="button"
        className="primary start-cook"
        disabled={!targetC || !minutes}
        onClick={() => onStart({ target_c: targetC!, minutes: minutes! })}
      >
        Start pan
      </button>
    </section>
  );
}

function suggestFat(cut: Cut): string {
  if (cut.protein === 'fish') return 'Avocado oil';
  if (cut.protein === 'beef' || cut.protein === 'lamb') return 'Lard / tallow';
  return 'Avocado oil';
}

function Metric({ eyebrow, big, sub }: { eyebrow: string; big: string; sub?: string }) {
  return (
    <div className="metric">
      <p className="eyebrow">{eyebrow}</p>
      <p className="big-number">{big}</p>
      {sub ? <p className="muted small">{sub}</p> : null}
    </div>
  );
}
