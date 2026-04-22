// apps/web/app/dashboard/apps/[slug]/analytics/charts.tsx
/**
 * Dependency-free SVG charts for the maker analytics dashboard.
 *
 * Plain presentational components — safe to render as Server Components.
 * Uses CSS custom properties from globals.css with inline fallbacks.
 */

interface LineChartPoint {
  label: string;
  value: number;
}

export function LineChart({
  points,
  width = 560,
  height = 140,
  label,
}: {
  points: LineChartPoint[];
  width?: number;
  height?: number;
  label?: string;
}) {
  if (points.length === 0) {
    return (
      <div
        style={{
          color: 'var(--text-light, #7A6B58)',
          fontSize: 13,
          padding: 24,
          textAlign: 'center',
        }}
      >
        No data yet
      </div>
    );
  }
  const pad = { l: 36, r: 12, t: 16, b: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = 0;
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;
  const y = (v: number) => pad.t + innerH - ((v - min) / (max - min)) * innerH;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad.l + i * xStep} ${y(p.value)}`)
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={label ?? 'chart'}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      <line
        x1={pad.l}
        y1={pad.t + innerH}
        x2={pad.l + innerW}
        y2={pad.t + innerH}
        stroke="var(--border, #3D3530)"
        strokeWidth={1}
      />
      <line
        x1={pad.l}
        y1={pad.t}
        x2={pad.l}
        y2={pad.t + innerH}
        stroke="var(--border, #3D3530)"
        strokeWidth={1}
      />
      <text
        x={pad.l - 8}
        y={pad.t + 4}
        fontSize={10}
        textAnchor="end"
        fill="var(--text-light, #7A6B58)"
      >
        {max}
      </text>
      <text
        x={pad.l - 8}
        y={pad.t + innerH}
        fontSize={10}
        textAnchor="end"
        fill="var(--text-light, #7A6B58)"
      >
        {min}
      </text>
      <path
        d={path}
        fill="none"
        stroke="var(--sunset, #E8603C)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface FunnelStep {
  label: string;
  value: number;
  color?: string;
}

export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((s) => (
        <div
          key={s.label}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div
            style={{
              width: 120,
              color: 'var(--text-secondary, #B8A88F)',
              fontSize: 13,
            }}
          >
            {s.label}
          </div>
          <div
            style={{
              flex: 1,
              background: 'var(--surface, #1E1A15)',
              borderRadius: 4,
              overflow: 'hidden',
              height: 24,
            }}
          >
            <div
              style={{
                width: `${(s.value / max) * 100}%`,
                background: s.color ?? 'var(--sunset, #E8603C)',
                height: '100%',
              }}
            />
          </div>
          <div
            style={{
              width: 60,
              textAlign: 'right',
              color: 'var(--text, #EDE4D3)',
              fontSize: 13,
              fontFamily: 'var(--font-mono, ui-monospace)',
            }}
          >
            {s.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
