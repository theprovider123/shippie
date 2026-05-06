/**
 * Roasting guide — oven temp (low/slow vs high/fast), per-protein internal,
 * carryover-aware pull temp, dry-brining, convection adjustment.
 */

import { useMemo } from 'react';
import {
  computeCookMinutes,
  DONENESS_LABEL,
  DONENESS_TEMP_C,
  formatDuration,
  type Cut,
  type Doneness,
} from '../data.ts';
import { estimateCarryover } from '../lib/carryover.ts';
import { TempCard } from './TempCard.tsx';

const DONENESS_ORDER: Doneness[] = [
  'rare',
  'med-rare',
  'medium',
  'med-well',
  'well-done',
];

interface RoastingGuideProps {
  cut: Cut;
  doneness: Doneness;
  weightKg: number;
  onDonenessChange(d: Doneness): void;
  onWeightChange(kg: number): void;
  onStart(args: { target_c: number; minutes: number }): void;
}

export function RoastingGuide({
  cut,
  doneness,
  weightKg,
  onDonenessChange,
  onWeightChange,
  onStart,
}: RoastingGuideProps) {
  const timing = cut.timing.roast;
  const usesWeight = !!timing?.minutes_per_kg;

  const targetC = useMemo(() => {
    if (timing?.target_temp_c) return timing.target_temp_c;
    if (cut.donenessApplies) return DONENESS_TEMP_C[doneness];
    return null;
  }, [timing, cut, doneness]);

  const minutes = useMemo(
    () => computeCookMinutes(cut, 'roast', usesWeight ? weightKg : null),
    [cut, weightKg, usesWeight],
  );

  const carryover = useMemo(
    () =>
      targetC ? estimateCarryover('roast', targetC, usesWeight ? weightKg : null) : null,
    [targetC, weightKg, usesWeight],
  );

  if (!timing) {
    return <p className="muted">Roasting isn’t the move for this cut.</p>;
  }

  return (
    <section className="guide guide--roast">
      <header className="guide-head">
        <p className="eyebrow">roast</p>
        <h2>Dry heat, then rest</h2>
        <p className="lede">
          The oven sets the surface; carryover finishes the centre. Pull{' '}
          {carryover ? `${carryover.rise_c}°C` : 'a few °C'} below target — the
          rest is where the cook actually lands.
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
        <Metric eyebrow="oven" big={timing.pit_temp_c ? `${timing.pit_temp_c}°C` : '—'} />
        <Metric eyebrow="target" big={targetC ? `${targetC}°C` : '—'} />
        <Metric
          eyebrow="pull at"
          big={carryover ? `${carryover.pull_at_c}°C` : '—'}
          sub={carryover ? `+${carryover.rise_c}°C carryover` : undefined}
        />
        <Metric eyebrow="cook" big={minutes ? formatDuration(minutes) : '—'} />
      </div>

      <TempCard cut={cut} expanded />

      {usesWeight ? (
        <label className="field">
          <span>weight (kg)</span>
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.1}
            value={weightKg}
            onChange={(e) => onWeightChange(Number(e.target.value) || 0)}
          />
        </label>
      ) : null}

      {carryover ? (
        <div className="callout">
          <strong>Carryover:</strong> {carryover.advice}
        </div>
      ) : null}

      {timing.note ? <p className="callout">{timing.note}</p> : null}

      <ul className="bullets">
        <li>
          <strong>Dry brine 24h ahead:</strong> 1% salt by weight, uncovered in
          the fridge. Skin dries, surface seasons through, browning is faster.
        </li>
        <li>
          <strong>Convection:</strong> drop oven temp 15°C and shave 25% off
          time. Check earlier — fan ovens cook faster than the dial admits.
        </li>
        <li>
          <strong>High then low:</strong> 15 min at 220°C to colour, drop to
          150–175°C to finish gently. Reverse for thin cuts.
        </li>
      </ul>

      <button
        type="button"
        className="primary start-cook"
        disabled={!targetC || !minutes}
        onClick={() => onStart({ target_c: targetC!, minutes: minutes! })}
      >
        Start roast
      </button>
    </section>
  );
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
