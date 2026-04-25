import { useEffect, useMemo, useState } from 'react';
import { listEntries } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { JournalEntry } from '../db/schema.ts';
import { computeChartGeometry, downsampleSentiment, type ChartPoint } from '../charts/sentiment-chart.ts';

const VIEWBOX = { width: 720, height: 240 };
const PADDING = { top: 24, right: 24, bottom: 32, left: 36 };

interface TrendsProps {
  refreshKey: number;
}

export function Trends({ refreshKey }: TrendsProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await listEntries(resolveLocalDb());
      if (!cancelled) {
        setEntries(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const points = useMemo(() => downsampleSentiment(entries), [entries]);
  const geometry = useMemo(
    () => computeChartGeometry(points, { width: VIEWBOX.width, height: VIEWBOX.height, padding: PADDING }),
    [points],
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Trends</h1>
        <span className="muted">{entries.length} entries</span>
      </header>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : points.length === 0 ? (
        <p className="muted">Write a few entries to see your sentiment trend.</p>
      ) : (
        <SentimentChart points={points} path={geometry.path} area={geometry.areaPath} />
      )}
    </div>
  );
}

interface SentimentChartProps {
  points: ChartPoint[];
  path: string;
  area: string;
}

function SentimentChart({ points, path, area }: SentimentChartProps) {
  const innerW = VIEWBOX.width - PADDING.left - PADDING.right;
  const midY = PADDING.top + (VIEWBOX.height - PADDING.top - PADDING.bottom) / 2;
  const firstDate = points[0]?.date;
  const lastDate = points[points.length - 1]?.date;

  return (
    <figure className="chart-figure">
      <svg
        role="img"
        aria-label="Sentiment over time"
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        className="sentiment-chart"
      >
        <line
          x1={PADDING.left}
          x2={PADDING.left + innerW}
          y1={midY}
          y2={midY}
          className="chart-axis"
        />
        <text x={PADDING.left - 8} y={PADDING.top + 4} textAnchor="end" className="chart-tick">
          +1
        </text>
        <text x={PADDING.left - 8} y={midY + 4} textAnchor="end" className="chart-tick">
          0
        </text>
        <text x={PADDING.left - 8} y={VIEWBOX.height - PADDING.bottom + 4} textAnchor="end" className="chart-tick">
          −1
        </text>
        <path d={area} className="chart-area" />
        <path d={path} className="chart-line" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} className={`chart-dot chart-dot-${p.label}`}>
            <title>
              {new Date(p.date).toLocaleDateString()} — {p.label} ({p.score.toFixed(2)})
            </title>
          </circle>
        ))}
        {firstDate ? (
          <text x={PADDING.left} y={VIEWBOX.height - PADDING.bottom + 18} className="chart-axis-label">
            {new Date(firstDate).toLocaleDateString()}
          </text>
        ) : null}
        {lastDate ? (
          <text x={VIEWBOX.width - PADDING.right} y={VIEWBOX.height - PADDING.bottom + 18} textAnchor="end" className="chart-axis-label">
            {new Date(lastDate).toLocaleDateString()}
          </text>
        ) : null}
      </svg>
      <figcaption className="muted small">Sentiment per entry. Values clamped to [-1, 1].</figcaption>
    </figure>
  );
}
