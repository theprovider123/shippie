/**
 * MedDoseTimeline — small stripe view of doses for one med across the
 * last N days. Each day is a square; squares are tinted by dose count
 * with darker = more, "miss" rendered as a slash overlay.
 */
import type { MedDose } from '../sync/care-doc.ts';
import { isoDateOf } from '../sync/care-doc.ts';

interface Props {
  doses: readonly MedDose[];
  /** How many trailing days to render. Default 7. */
  days?: number;
  now?: Date;
}

interface DayCell {
  iso: string;
  given: number;
  missed: number;
}

function buildCells(doses: readonly MedDose[], days: number, now: Date): DayCell[] {
  const cells: DayCell[] = [];
  const today = new Date(now);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    cells.push({ iso: isoDateOf(d), given: 0, missed: 0 });
  }
  const cellByIso = new Map(cells.map((c) => [c.iso, c]));
  for (const dose of doses) {
    const iso = isoDateOf(new Date(dose.given_at));
    const cell = cellByIso.get(iso);
    if (!cell) continue;
    if (dose.missed) cell.missed += 1;
    else cell.given += 1;
  }
  return cells;
}

export function MedDoseTimeline({ doses, days = 7, now = new Date() }: Props) {
  const cells = buildCells(doses, days, now);
  const max = Math.max(1, ...cells.map((c) => c.given));
  return (
    <div className="cl-timeline" aria-label={`${days}-day dose timeline`}>
      {cells.map((cell) => {
        const intensity = cell.given === 0 ? 0 : Math.min(1, cell.given / max);
        return (
          <div
            key={cell.iso}
            className="cl-timeline-cell"
            data-missed={cell.missed > 0}
            style={{ '--cl-tint': intensity.toFixed(2) } as React.CSSProperties}
            title={`${cell.iso} · ${cell.given} given${cell.missed ? `, ${cell.missed} missed` : ''}`}
          />
        );
      })}
    </div>
  );
}
