/**
 * Tiny SVG chart variants. No external charting lib — the data is
 * small and the marks are easy to render by hand. Each variant takes
 * the rows + the config and renders a fixed-aspect block.
 */
import { bucketByDay, countToday, heatmapMatrix } from './aggregate.ts';
import type { LoggedRow } from './types.ts';

export interface ChartProps {
  rows: readonly LoggedRow[];
  themeColor: string;
  countTarget?: number;
  windowDays?: number;
}

export function Sparkline({ rows, themeColor, windowDays = 30 }: ChartProps) {
  const buckets = bucketByDay(rows, windowDays);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const width = 320;
  const height = 80;
  const stepX = width / Math.max(1, buckets.length - 1);
  const points = buckets
    .map((b, i) => `${i * stepX},${height - (b.count / max) * (height - 6) - 3}`)
    .join(' ');
  return (
    <svg
      className="ml-chart ml-sparkline"
      width={width}
      height={height}
      role="img"
      aria-label="Daily log sparkline"
    >
      <polyline
        fill="none"
        stroke={themeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <polyline
        fill={`${themeColor}22`}
        stroke="none"
        points={`0,${height} ${points} ${width},${height}`}
      />
    </svg>
  );
}

export function CountChart({ rows, themeColor, countTarget = 8 }: ChartProps) {
  const today = countToday(rows);
  const ratio = Math.min(1, today / Math.max(1, countTarget));
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ml-chart ml-count">
      <svg width={96} height={96} role="img" aria-label={`${today} of ${countTarget} today`}>
        <circle cx={48} cy={48} r={radius} stroke={`${themeColor}33`} strokeWidth={8} fill="none" />
        <circle
          cx={48}
          cy={48}
          r={radius}
          stroke={themeColor}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${circumference * (1 - ratio)}`}
          transform="rotate(-90 48 48)"
        />
        <text
          x={48}
          y={52}
          textAnchor="middle"
          fontSize={20}
          fontWeight={600}
          fill="currentColor"
        >
          {today}
        </text>
      </svg>
      <div className="ml-count-label">
        of {countTarget} target
      </div>
    </div>
  );
}

export function Heatmap({ rows, themeColor, windowDays = 28 }: ChartProps) {
  const matrix = heatmapMatrix(rows, windowDays);
  const max = Math.max(1, ...matrix.map((c) => c.count));
  const cellSize = 14;
  const gap = 2;
  const cols = Math.max(1, ...matrix.map((c) => c.weekColumn + 1));
  const width = cols * (cellSize + gap);
  const height = 7 * (cellSize + gap);
  return (
    <svg
      className="ml-chart ml-heatmap"
      width={width}
      height={height}
      role="img"
      aria-label="Activity heatmap"
    >
      {matrix.map((cell) => {
        const opacity = cell.count === 0 ? 0.08 : 0.25 + (cell.count / max) * 0.75;
        return (
          <rect
            key={`${cell.weekColumn}-${cell.weekday}`}
            x={cell.weekColumn * (cellSize + gap)}
            y={cell.weekday * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={3}
            fill={themeColor}
            fillOpacity={opacity}
          >
            <title>
              {cell.date} — {cell.count}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
