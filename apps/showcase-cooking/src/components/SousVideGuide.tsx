/**
 * Sous Vide guide — bath temp + duration table + drift-extension formula
 * + reverse-sear suggestion + bag-vs-vacuum note.
 *
 * The bath temperature IS the doneness. There is no overcooking by time
 * (until texture goes mushy past the upper bound for a cut). Display the
 * doneness-temp ladder explicitly; let the user nudge.
 */

import { useMemo, useState } from 'react';
import {
  DONENESS_LABEL,
  DONENESS_TEMP_C,
  formatDuration,
  type Cut,
  type Doneness,
} from '../data.ts';
import { adjustForBathDrift, bathDriftIsCritical } from '../lib/cook-time.ts';
import { TempCard } from './TempCard.tsx';

const DONENESS_ORDER: Doneness[] = [
  'rare',
  'med-rare',
  'medium',
  'med-well',
  'well-done',
];

interface SousVideGuideProps {
  cut: Cut;
  doneness: Doneness;
  onDonenessChange(d: Doneness): void;
  onStart(args: { target_c: number; minutes: number }): void;
}

export function SousVideGuide({ cut, doneness, onDonenessChange, onStart }: SousVideGuideProps) {
  const timing = cut.timing['sous-vide'];
  const [actualBathC, setActualBathC] = useState<number | ''>('');

  const targetC = useMemo(() => {
    if (timing?.target_temp_c) return timing.target_temp_c;
    if (cut.donenessApplies) return DONENESS_TEMP_C[doneness];
    return null;
  }, [timing, cut, doneness]);

  const baseMinutes = timing?.cook_minutes ?? null;

  const drift =
    typeof actualBathC === 'number' && targetC ? actualBathC - targetC : 0;
  const adjustedMinutes =
    baseMinutes && drift < 0 ? adjustForBathDrift(baseMinutes, drift) : baseMinutes;
  const driftCritical = bathDriftIsCritical(drift);

  const minutes = adjustedMinutes ?? baseMinutes;

  if (!timing) {
    return (
      <p className="muted">Sous vide isn’t the move for this cut. Try another method.</p>
    );
  }

  return (
    <section className="guide guide--sous-vide">
      <header className="guide-head">
        <p className="eyebrow">sous vide</p>
        <h2>Bath temp = doneness</h2>
        <p className="lede">
          Set the bath, drop the bag, walk away. The protein cannot exceed bath
          temp, so the only timer that matters is the minimum to cook through —
          and an upper bound past which texture turns mushy.
        </p>
      </header>

      {cut.donenessApplies ? (
        <div className="ladder" role="radiogroup" aria-label="Doneness">
          <p className="eyebrow">doneness ladder</p>
          {DONENESS_ORDER.map((d) => {
            const t = DONENESS_TEMP_C[d];
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === doneness}
                className={`ladder-row ${d === doneness ? 'ladder-row--active' : ''}`}
                onClick={() => onDonenessChange(d)}
              >
                <span className="ladder-temp">{t}°C</span>
                <span className="ladder-label">{DONENESS_LABEL[d]}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="metric-grid">
        <Metric eyebrow="bath" big={targetC ? `${targetC}°C` : '—'} />
        <Metric
          eyebrow="cook"
          big={minutes ? formatDuration(minutes) : '—'}
          sub={
            minutes && minutes !== baseMinutes
              ? `base ${formatDuration(baseMinutes ?? 0)}, +${minutes - (baseMinutes ?? 0)}m for drift`
              : undefined
          }
        />
      </div>

      <TempCard cut={cut} expanded />

      <label className="field drift-field">
        <span>actual bath temp (optional)</span>
        <input
          type="number"
          step={0.5}
          placeholder={targetC ? `${targetC}` : ''}
          value={actualBathC === '' ? '' : actualBathC}
          onChange={(e) => {
            const v = e.target.value;
            setActualBathC(v === '' ? '' : Number(v));
          }}
        />
        <small className="muted">
          If your immersion circulator has drifted below target, sous vide time
          extends ~10% per °C below. {driftCritical ? <strong> Drift over 3°C — pull, reset, restart.</strong> : null}
        </small>
      </label>

      {timing.note ? <p className="callout">{timing.note}</p> : null}

      <ul className="bullets">
        <li>
          <strong>Vacuum vs zip-bag:</strong> water-displacement (Archimedes) in
          a quality zip is fine for under 4h. Past that, vacuum or use double
          bags — air re-entry leads to bobbing and uneven cook.
        </li>
        <li>
          <strong>Reverse sear:</strong> when the bath is done, ice the bag for
          2 min to stiffen the surface, pat bone-dry, then 30–60s per side in a
          screaming-hot pan. Colour, not cooking.
        </li>
        <li>
          <strong>Upper bound:</strong> tender cuts go mushy past ~4h at temp.
          Tough cuts (short rib, chuck) want long — 24–72h at 60°C.
        </li>
      </ul>

      <button
        type="button"
        className="primary start-cook"
        disabled={!targetC || !minutes}
        onClick={() => onStart({ target_c: targetC!, minutes: minutes! })}
      >
        Start sous vide
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

