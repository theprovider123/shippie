/**
 * Visual plate-load chip. Shows the plate stack on each side of the
 * bar for a target load.
 */
import { solvePlates } from '../utils/plate-calc.ts';

interface PlateBreakdownProps {
  targetLoad: number;
  barWeight: number;
  plates: readonly number[];
}

export function PlateBreakdown({ targetLoad, barWeight, plates }: PlateBreakdownProps) {
  const result = solvePlates({ targetLoad, barWeight, plates });
  if (result.plates.length === 0 && targetLoad <= barWeight) {
    return (
      <p className="lift-plate-chip lift-plate-chip--bare" aria-label="Plate breakdown">
        Just the {barWeight}kg bar
      </p>
    );
  }
  if (result.plates.length === 0) {
    return null;
  }
  const counts = countPlates(result.plates);
  return (
    <div className="lift-plate-chip" aria-label="Plate breakdown">
      <span className="lift-plate-chip__lead">Per side</span>
      <span className="lift-plate-chip__plates">
        {counts.map((c) => (
          <span key={c.weight} className="lift-plate-chip__plate">
            {c.count}× {formatPlate(c.weight)}
          </span>
        ))}
      </span>
      {!result.exact ? (
        <span className="lift-plate-chip__warn">
          ≈ {formatPlate(result.achievedLoad)}
        </span>
      ) : null}
    </div>
  );
}

function countPlates(plates: number[]): { weight: number; count: number }[] {
  const out: { weight: number; count: number }[] = [];
  for (const p of plates) {
    const last = out[out.length - 1];
    if (last && last.weight === p) last.count += 1;
    else out.push({ weight: p, count: 1 });
  }
  return out;
}

function formatPlate(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toString();
}
