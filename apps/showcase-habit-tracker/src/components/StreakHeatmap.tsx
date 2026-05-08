import { useMemo } from 'react';
import { buildHeatmap } from '../lib/streak-math.ts';
import type { Habit, HabitCheck } from '../types.ts';

/**
 * GitHub-style year heatmap. Each square = one day. Done = sage green,
 * partial = warm amber, missed = grey wash, n/a (before habit existed)
 * = empty.
 *
 * Voice rule: missed days are *grey*, not red. The wall is honest, not
 * accusatory.
 */
export function StreakHeatmap({
  habit,
  today,
  checks,
}: {
  habit: Pick<Habit, 'id' | 'createdAt' | 'name'>;
  today: string;
  checks: readonly HabitCheck[];
}) {
  const cells = useMemo(
    () => buildHeatmap(habit, today, checks, 364),
    [habit, today, checks],
  );

  // Group into 52 weeks of 7 — render as a CSS grid with explicit
  // column count for stability.
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="heatmap" aria-label={`${habit.name} year history`}>
      <div className="heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-col">
            {week.map((cell) => (
              <span
                key={cell.day}
                className={`heatmap-cell heatmap-${cell.status ?? 'na'}`}
                title={`${cell.day} — ${cell.status ?? 'before this habit existed'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span className="heatmap-cell heatmap-na" /> n/a
        <span className="heatmap-cell heatmap-missed" /> missed
        <span className="heatmap-cell heatmap-partial" /> partial
        <span className="heatmap-cell heatmap-done" /> done
      </div>
    </div>
  );
}
