/**
 * Grilling guide — direct vs indirect, surface temp targets, char vs steam
 * (lid open vs closed), wood-chip box for smoke, safe internal temps.
 */

import { useMemo, useState } from 'react';
import {
  computeCookMinutes,
  DONENESS_LABEL,
  DONENESS_TEMP_C,
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

type Zone = 'direct' | 'indirect' | 'two-zone';
type Lid = 'open' | 'closed';

interface GrillingGuideProps {
  cut: Cut;
  doneness: Doneness;
  onDonenessChange(d: Doneness): void;
  onStart(args: { target_c: number; minutes: number }): void;
}

export function GrillingGuide({ cut, doneness, onDonenessChange, onStart }: GrillingGuideProps) {
  const timing = cut.timing.grill;
  const [zone, setZone] = useState<Zone>(() => suggestZone(cut));
  const [lid, setLid] = useState<Lid>(() => suggestLid(cut));

  const targetC = useMemo(() => {
    if (timing?.target_temp_c) return timing.target_temp_c;
    if (cut.donenessApplies) return DONENESS_TEMP_C[doneness];
    return null;
  }, [timing, cut, doneness]);

  const minutes = useMemo(() => computeCookMinutes(cut, 'grill', null), [cut]);

  if (!timing) {
    return <p className="muted">This one stays off the grill.</p>;
  }

  return (
    <section className="guide guide--grill">
      <header className="guide-head">
        <p className="eyebrow">grill</p>
        <h2>Char in zone, finish in zone two</h2>
        <p className="lede">
          Build a two-zone fire — coals piled on one side, empty on the other.
          Sear over direct, finish over indirect. Lid behaviour decides char vs
          steam.
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

      <div className="seg-control" role="radiogroup" aria-label="Heat zone">
        {(['direct', 'two-zone', 'indirect'] as Zone[]).map((z) => (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={z === zone}
            className={`seg ${z === zone ? 'seg--active' : ''}`}
            onClick={() => setZone(z)}
          >
            {z}
          </button>
        ))}
      </div>

      <div className="seg-control" role="radiogroup" aria-label="Lid">
        {(['open', 'closed'] as Lid[]).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === lid}
            className={`seg ${l === lid ? 'seg--active' : ''}`}
            onClick={() => setLid(l)}
          >
            lid {l}
          </button>
        ))}
      </div>

      <p className="callout">
        {lid === 'open'
          ? 'Lid open: convective steam vents, surface dries, char accelerates. The default for steaks and chops.'
          : 'Lid closed: traps moisture and smoke, cook is faster but bark is softer. The default for thicker cuts and indirect zones.'}
        {' '}
        {zone === 'direct'
          ? 'Direct heat: 240–315°C surface — a few minutes per side, no more.'
          : zone === 'indirect'
            ? 'Indirect heat: 150–175°C — longer, gentler, no flare-ups.'
            : 'Two-zone: sear direct, finish indirect. The single highest-leverage technique on a grill.'}
      </p>

      <div className="metric-grid">
        <Metric eyebrow="surface" big={zone === 'direct' ? '240°C+' : zone === 'indirect' ? '~165°C' : '2-zone'} />
        <Metric eyebrow="internal" big={targetC ? `${targetC}°C` : '—'} />
        <Metric eyebrow="cook" big={minutes ? formatDuration(minutes) : '—'} sub={timing.per_side_minutes ? `${timing.per_side_minutes} min/side` : undefined} />
      </div>

      <TempCard cut={cut} expanded />

      {timing.note ? <p className="callout">{timing.note}</p> : null}

      <ul className="bullets">
        <li>
          <strong>Wood-chip box:</strong> a foil packet of soaked chips on the
          coals adds smoke without committing to a smoker. Apple for pork, oak
          for beef, alder for fish.
        </li>
        <li>
          <strong>Flare-ups:</strong> drips on coals = flames = soot. Move to
          indirect, close lid 30s, return when coals settle.
        </li>
        <li>
          <strong>Clean grates hot:</strong> brush after preheat, oil with a
          paper-towel-and-tongs swipe, then lay protein down — it releases when
          ready, not before.
        </li>
      </ul>

      <button
        type="button"
        className="primary start-cook"
        disabled={!targetC || !minutes}
        onClick={() => onStart({ target_c: targetC!, minutes: minutes! })}
      >
        Start grill
      </button>
    </section>
  );
}

function suggestZone(cut: Cut): Zone {
  // Thin cuts → direct; thick / bone-in → two-zone.
  if (cut.id.includes('steak') || cut.id.includes('chop') || cut.id === 'tuna-steak') {
    return 'direct';
  }
  if (cut.id.includes('rib') || cut.id === 'chicken-thigh' || cut.id === 'chicken-breast') {
    return 'two-zone';
  }
  return 'two-zone';
}

function suggestLid(cut: Cut): Lid {
  if (cut.id.includes('steak') || cut.id.includes('chop')) return 'open';
  return 'closed';
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
