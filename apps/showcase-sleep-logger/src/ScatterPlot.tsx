/**
 * P3 — locally-drawn SVG scatter plot of sleep quality vs same-day
 * activity events. No charting library — the dataset is small and the
 * marks read clearly with hand-rolled SVG.
 *
 * Intended to surface the same correlation that `correlation.ts`
 * computes, but visually. Useful when the user has nights+events but
 * the Pearson result hasn't crossed the surfacing threshold yet.
 */
import { useMemo } from 'react';

interface Point {
  /** Same-day event count (X axis). */
  events: number;
  /** Sleep quality 1..10 (Y axis). */
  quality: number;
  /** Tooltip-ish label. */
  date: string;
}

export interface ScatterPlotProps {
  points: readonly Point[];
  width?: number;
  height?: number;
  axisColor?: string;
  pointColor?: string;
}

export function ScatterPlot({
  points,
  width = 320,
  height = 180,
  axisColor = 'rgba(20, 18, 15, 0.2)',
  pointColor = '#4E7C9A',
}: ScatterPlotProps) {
  const padding = 24;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const maxX = useMemo(() => {
    const m = points.reduce((acc, p) => Math.max(acc, p.events), 0);
    return Math.max(2, m);
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="scatter-empty" aria-label="Scatter plot — no data yet">
        <span>Log a few nights to see the pattern.</span>
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Sleep quality vs same-day activity events"
      className="scatter"
    >
      {/* axes */}
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke={axisColor}
      />
      <line
        x1={padding}
        y1={padding}
        x2={padding}
        y2={height - padding}
        stroke={axisColor}
      />
      {/* y-axis ticks at quality 1, 5, 10 */}
      {[1, 5, 10].map((q) => {
        const y = padding + innerH - ((q - 1) / 9) * innerH;
        return (
          <g key={q}>
            <line x1={padding - 4} y1={y} x2={padding} y2={y} stroke={axisColor} />
            <text
              x={padding - 6}
              y={y + 3}
              fontSize={9}
              textAnchor="end"
              fill="rgba(20, 18, 15, 0.5)"
            >
              {q}
            </text>
          </g>
        );
      })}
      {/* x-axis ticks at 0, max/2, max */}
      {[0, Math.round(maxX / 2), maxX].map((x) => {
        const cx = padding + (x / maxX) * innerW;
        return (
          <g key={x}>
            <line
              x1={cx}
              y1={height - padding}
              x2={cx}
              y2={height - padding + 4}
              stroke={axisColor}
            />
            <text
              x={cx}
              y={height - padding + 14}
              fontSize={9}
              textAnchor="middle"
              fill="rgba(20, 18, 15, 0.5)"
            >
              {x}
            </text>
          </g>
        );
      })}
      {/* axis labels */}
      <text
        x={width / 2}
        y={height - 4}
        fontSize={10}
        textAnchor="middle"
        fill="rgba(20, 18, 15, 0.55)"
      >
        Same-day events
      </text>
      <text
        x={6}
        y={padding}
        fontSize={10}
        textAnchor="start"
        fill="rgba(20, 18, 15, 0.55)"
      >
        Quality
      </text>
      {/* points */}
      {points.map((p, i) => {
        const cx = padding + (p.events / maxX) * innerW;
        const cy = padding + innerH - ((p.quality - 1) / 9) * innerH;
        return (
          <circle
            key={`${p.date}-${i}`}
            cx={cx}
            cy={cy}
            r={4}
            fill={pointColor}
            opacity={0.7}
          >
            <title>{`${p.date} · ${p.quality}/10 · ${p.events} event(s)`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
