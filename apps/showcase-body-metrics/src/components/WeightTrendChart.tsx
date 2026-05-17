/**
 * Weight trend chart — daily dots + 7-day rolling line + optional goal line.
 *
 * Pure SVG, no chart library. The whole point of this app is to be a
 * quick install with no leaks; pulling in a charting library
 * inflates bundle size and adds dependencies the user can't audit.
 */
import { useMemo } from 'react';
import type { Measurement } from '../lib/trend.ts';
import { rollingAverage } from '../lib/trend.ts';

interface WeightTrendChartProps {
  measurements: readonly Measurement[];
  /** Goal line in kg, optional. */
  goalKg?: number | null;
  /** Goal date, used to extend the goal-line gridline label. */
  goalDate?: string | null;
  windowDays?: number;
  height?: number;
  width?: number;
}

const PADDING = { top: 12, right: 12, bottom: 24, left: 36 };

export function WeightTrendChart({
  measurements,
  goalKg = null,
  goalDate = null,
  windowDays = 7,
  height = 220,
  width = 480,
}: WeightTrendChartProps) {
  const series = useMemo(() => rollingAverage(measurements, windowDays), [measurements, windowDays]);

  if (series.length < 2) {
    return (
      <div className="chart chart--empty">
        <p>Log at least two days of weight to see the chart.</p>
      </div>
    );
  }

  const values = [
    ...series.map((p) => p.weightKg),
    ...series.map((p) => p.rollingKg).filter((v): v is number => v !== null),
  ];
  if (goalKg !== null && goalKg !== undefined) values.push(goalKg);
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const span = Math.max(0.5, maxRaw - minRaw);
  const yMin = minRaw - span * 0.15;
  const yMax = maxRaw + span * 0.15;

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const xAt = (i: number) =>
    PADDING.left + (series.length === 1 ? innerW / 2 : (i * innerW) / (series.length - 1));
  const yAt = (kg: number) =>
    PADDING.top + innerH - ((kg - yMin) / (yMax - yMin)) * innerH;

  const rollingPath = series
    .map((p, i) => (p.rollingKg === null ? null : { x: xAt(i), y: yAt(p.rollingKg) }))
    .filter((v): v is { x: number; y: number } => v !== null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const yTicks = niceTicks(yMin, yMax, 4);

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Weight trend chart, ${series.length} measurements`}
      >
        {/* Y axis gridlines + labels */}
        {yTicks.map((t) => (
          <g key={t} className="chart__grid">
            <line x1={PADDING.left} x2={width - PADDING.right} y1={yAt(t)} y2={yAt(t)} />
            <text x={PADDING.left - 6} y={yAt(t) + 3} textAnchor="end">
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Goal line */}
        {goalKg !== null && goalKg !== undefined && goalKg >= yMin && goalKg <= yMax && (
          <g className="chart__goal">
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={yAt(goalKg)}
              y2={yAt(goalKg)}
              strokeDasharray="4 4"
            />
            <text x={width - PADDING.right - 4} y={yAt(goalKg) - 4} textAnchor="end">
              goal {goalKg.toFixed(1)} kg{goalDate ? ` · ${goalDate}` : ''}
            </text>
          </g>
        )}

        {/* Daily dots */}
        {series.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={xAt(i)}
            cy={yAt(p.weightKg)}
            r={2.5}
            className="chart__dot"
          />
        ))}

        {/* Rolling-average line */}
        {rollingPath && <path d={rollingPath} className="chart__line" fill="none" />}

        {/* X axis edge labels */}
        <text
          x={PADDING.left}
          y={height - 6}
          className="chart__axis"
          textAnchor="start"
        >
          {series[0]!.date}
        </text>
        <text
          x={width - PADDING.right}
          y={height - 6}
          className="chart__axis"
          textAnchor="end"
        >
          {series[series.length - 1]!.date}
        </text>
      </svg>
      <p className="chart__legend">
        <span className="chart__legend-dot" /> Daily reading
        <span className="chart__legend-line" /> {windowDays}-day average
        {goalKg !== null && goalKg !== undefined && (
          <>
            <span className="chart__legend-goal" /> Goal
          </>
        )}
      </p>
    </div>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = (max - min) / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i += 1) ticks.push(min + i * step);
  return ticks;
}
