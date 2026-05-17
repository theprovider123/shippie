/**
 * Smoking guide — pit temp, wood-pellet pairing, the stall, bark-vs-bite,
 * pull / probe-tender targets.
 *
 * The headline interaction is wood-pairing: classify the user's chosen
 * wood against the protein and surface a tier (best / good / avoid).
 */

import { useMemo, useState } from 'react';
import {
  computeCookMinutes,
  formatDuration,
  type Cut,
} from '../data.ts';
import { classifyStall, estimateStallHoursRemaining, STALL_RANGE_C } from '../lib/stall.ts';
import { classifyWood, pairingFor } from '../lib/wood-pairing.ts';
import { TempCard } from './TempCard.tsx';

interface SmokingGuideProps {
  cut: Cut;
  weightKg: number;
  onWeightChange(kg: number): void;
  onStart(args: { target_c: number; minutes: number }): void;
}

export function SmokingGuide({ cut, weightKg, onWeightChange, onStart }: SmokingGuideProps) {
  const timing = cut.timing.smoke;
  const pairing = pairingFor(cut.protein);
  const [chosenWood, setChosenWood] = useState('');
  const [probeC, setProbeC] = useState<number | ''>('');
  const [hoursAtStall, setHoursAtStall] = useState<number>(0);

  const minutes = useMemo(
    () => computeCookMinutes(cut, 'smoke', weightKg),
    [cut, weightKg],
  );
  const usesWeight = !!timing?.minutes_per_kg;
  const targetC = timing?.target_temp_c ?? null;
  const pitC = timing?.pit_temp_c ?? null;

  const woodTier = chosenWood ? classifyWood(cut.protein, chosenWood) : 'unknown';

  const stall = typeof probeC === 'number' ? classifyStall(probeC, hoursAtStall) : null;
  const stallEstimate = typeof probeC === 'number' ? estimateStallHoursRemaining(probeC) : null;

  if (!timing) {
    return <p className="muted">This cut doesn’t want to be smoked. Try roast or grill.</p>;
  }

  return (
    <section className="guide guide--smoke">
      <header className="guide-head">
        <p className="eyebrow">smoke</p>
        <h2>Low and slow, or hot and fast</h2>
        <p className="lede">
          Pit temp dictates time and bark. {pitC && pitC <= 115 ? '110°C is the classic Texas low-and-slow' : '120–135°C is hot-and-fast — shorter, lighter bark'}
          {' '}for {cut.name.toLowerCase()}. Probe-tender wins over thermometer alone.
        </p>
      </header>

      <div className="metric-grid">
        <Metric eyebrow="pit" big={pitC ? `${pitC}°C` : '—'} sub={pitC && pitC <= 115 ? 'low-and-slow' : 'hot-and-fast'} />
        <Metric eyebrow="pull at" big={targetC ? `${targetC}°C` : 'probe'} sub={targetC ? 'or probe-tender' : 'feel before temp'} />
        <Metric eyebrow="cook" big={minutes ? formatDuration(minutes) : '—'} sub={usesWeight ? `${weightKg} kg @ ${timing.minutes_per_kg}m/kg` : undefined} />
      </div>

      <TempCard cut={cut} expanded />

      {usesWeight ? (
        <label className="field">
          <span>weight (kg)</span>
          <input
            type="number"
            min={0.5}
            max={15}
            step={0.1}
            value={weightKg}
            onChange={(e) => onWeightChange(Number(e.target.value) || 0)}
          />
        </label>
      ) : null}

      {/* Wood pairing */}
      <div className="wood">
        <p className="eyebrow">wood / pellet</p>
        <div className="wood-tiers">
          <Tier label="best" items={pairing.best} active={woodTier === 'best'} />
          <Tier label="good" items={pairing.good} active={woodTier === 'good'} />
          <Tier label="avoid" items={pairing.avoid} active={woodTier === 'avoid'} />
        </div>
        <input
          type="text"
          className="wood-input"
          placeholder="What wood are you running?"
          value={chosenWood}
          onChange={(e) => setChosenWood(e.target.value)}
        />
        {chosenWood ? (
          <p className={`wood-feedback wood-feedback--${woodTier}`}>
            {woodTier === 'best' && `Classic. ${pairing.note}`}
            {woodTier === 'good' && `Solid. ${pairing.note}`}
            {woodTier === 'avoid' && `Reconsider — ${pairing.note}`}
            {woodTier === 'unknown' && 'Not in the pairing chart — proceed with intent.'}
          </p>
        ) : (
          <p className="muted small">{pairing.note}</p>
        )}
      </div>

      {/* Stall coach */}
      <div className="stall-coach">
        <p className="eyebrow">the stall</p>
        <p className="muted small">
          Around {STALL_RANGE_C[0]}–{STALL_RANGE_C[1]}°C internal, evaporative cooling pins your climb. Wrap to push through, or ride for thicker bark.
        </p>
        <div className="stall-inputs">
          <label className="field field--inline">
            <span>internal probe (°C)</span>
            <input
              type="number"
              step={1}
              value={probeC === '' ? '' : probeC}
              onChange={(e) => {
                const v = e.target.value;
                setProbeC(v === '' ? '' : Number(v));
              }}
            />
          </label>
          <label className="field field--inline">
            <span>hours at this temp</span>
            <input
              type="number"
              step={0.5}
              min={0}
              value={hoursAtStall}
              onChange={(e) => setHoursAtStall(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        {stall ? (
          <div className={`stall-verdict stall-verdict--${stall.stage}`}>
            <strong>{stageLabel(stall.stage)}.</strong> {stall.advice}
            {stall.stage === 'stall' && stallEstimate !== null ? (
              <p className="muted small">
                Riding from here is roughly {stallEstimate}h to clear.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {timing.note ? <p className="callout">{timing.note}</p> : null}

      <ul className="bullets">
        <li>
          <strong>Probe-tender:</strong> probe slides in like soft butter.
          Brisket at ~96°C, pulled pork at ~93°C, ribs by bend test (lift one
          end — surface cracks across the bones).
        </li>
        <li>
          <strong>Wrap or ride:</strong> butcher paper preserves bark, foil is
          faster + softer. Wrap when bark is set (~2h into stall).
        </li>
        <li>
          <strong>Long rest:</strong> hold in a cooler 30–60 min minimum after
          pulling. The muscle relaxes; juice redistributes; the bark stays
          intact while you slice.
        </li>
      </ul>

      <button
        type="button"
        className="primary start-cook"
        disabled={!targetC || !minutes}
        onClick={() => onStart({ target_c: targetC!, minutes: minutes! })}
      >
        Start smoke
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

function Tier({ label, items, active }: { label: string; items: ReadonlyArray<string>; active: boolean }) {
  return (
    <div className={`tier tier--${label} ${active ? 'tier--match' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className="tier-items">{items.join(', ')}</p>
    </div>
  );
}

function stageLabel(stage: 'pre-stall' | 'stall' | 'post-stall'): string {
  if (stage === 'pre-stall') return 'Pre-stall';
  if (stage === 'stall') return 'In the stall';
  return 'Through the stall';
}
