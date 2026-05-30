/**
 * The running data band for Today: energy, the macro split, and the
 * tracked lines. Progress is shown neutrally — bars fill toward goals,
 * a sage dot marks "reached", an amber dot marks a crossed watch line.
 * Nothing turns red; nothing is framed as a failure.
 */
import type { Nutrients, Targets } from '../lib/types';
import { macroBreakdown, progressToward, withinCeiling } from '../lib/nutrition';
import { clamp01, fmt } from '../lib/format';

interface Props {
  totals: Nutrients;
  targets: Targets;
}

function Goal({
  label,
  value,
  target,
  unit,
  cls,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  cls: string;
}) {
  const p = progressToward(value, target);
  return (
    <div className="stat">
      <div className="label">
        <span>{label}</span>
        {p.reached ? <span className="dot-reached" aria-label="reached">●</span> : null}
      </div>
      <div className="value num">
        {fmt(value)}
        <span className="of"> / {fmt(target)} {unit}</span>
      </div>
      <div className={`bar ${cls}${p.reached ? ' reached' : ''}`}>
        <i style={{ width: `${clamp01(p.ratio) * 100}%` }} />
      </div>
    </div>
  );
}

function Ceiling({
  label,
  value,
  ceiling,
  unit,
}: {
  label: string;
  value: number;
  ceiling: number;
  unit: string;
}) {
  const c = withinCeiling(value, ceiling);
  return (
    <div className="stat">
      <div className="label">
        <span>{label}</span>
        {c.over ? <span className="dot-watch" aria-label="above watch line">●</span> : null}
      </div>
      <div className="value num">
        {fmt(value)}
        <span className="of"> / {fmt(ceiling)} {unit}</span>
      </div>
      <div className="bar">
        <i
          style={{
            width: `${clamp01(c.ratio) * 100}%`,
            background: c.over ? 'var(--watch)' : 'var(--ink-3)',
          }}
        />
      </div>
    </div>
  );
}

export function DataBand({ totals, targets }: Props) {
  const mb = macroBreakdown(totals);
  const ekcal = progressToward(totals.kcal, targets.kcal);
  return (
    <div className="stack">
      <div className="band">
        <div className="stat kcal">
          <div className="label">
            <span>Energy</span>
            <span className="num">{Math.round(ekcal.remaining)} left</span>
          </div>
          <div className="value num">
            {fmt(totals.kcal)}
            <span className="of"> / {fmt(targets.kcal)} kcal</span>
          </div>
          <div className="ribbon" role="img" aria-label="macro split">
            <span className="p" style={{ width: `${mb.proteinPct}%` }} />
            <span className="c" style={{ width: `${mb.carbPct}%` }} />
            <span className="f" style={{ width: `${mb.fatPct}%` }} />
          </div>
          <div className="legend">
            <span><i className="p" />Protein {mb.proteinPct}%</span>
            <span><i className="c" />Carb {mb.carbPct}%</span>
            <span><i className="f" />Fat {mb.fatPct}%</span>
          </div>
        </div>

        <Goal label="Protein" value={totals.protein_g} target={targets.protein_g} unit="g" cls="protein" />
        <Goal label="Carbs" value={totals.carb_g} target={targets.carb_g} unit="g" cls="carb" />
        <Goal label="Fat" value={totals.fat_g} target={targets.fat_g} unit="g" cls="fat" />
        <Goal label="Fiber" value={totals.fiber_g} target={targets.fiber_g} unit="g" cls="fiber" />
        <Ceiling label="Sodium" value={totals.sodium_mg} ceiling={targets.sodium_mg} unit="mg" />
        <Goal label="Water" value={totals.water_ml} target={targets.water_ml} unit="ml" cls="" />
        {totals.caffeine_mg > 0 ? (
          <Ceiling label="Caffeine" value={totals.caffeine_mg} ceiling={targets.caffeine_mg} unit="mg" />
        ) : null}
      </div>
    </div>
  );
}
