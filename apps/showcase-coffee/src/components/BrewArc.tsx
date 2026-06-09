// Ported from lot-components.jsx — the circular brew progress arc.
//
// Mechanical feel comes from a CSS transition on the stroke-dasharray (the
// design's own technique), not a JS animation loop. Step markers and the
// centre label are driven by the recipe's steps so any method works.

import { C } from '../tokens.ts';

export interface ArcStep {
  label: string;
  targetTime: number; // cumulative seconds
}

export interface BrewArcProps {
  elapsed: number;
  total?: number;
  steps?: ArcStep[];
  size?: number;
}

export function BrewArc({ elapsed, total = 28, steps = [], size = 186 }: BrewArcProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;
  const circ = 2 * Math.PI * r;
  const progress = Math.min(elapsed / total, 1);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
  const step = stepLabel(elapsed, total, steps);
  const arcColor = elapsed >= total ? C.sage : C.terracotta;

  const markerTimes = steps.length > 0
    ? steps.map((s) => s.targetTime).filter((t) => t > 0 && t < total)
    : [5, 10];
  const markers = markerTimes.map((t) => {
    const a = (t / total) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.tanLight} strokeWidth="6" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={arcColor}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${progress * circ} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.4s ease' }}
      />
      {markers.map((m, i) => (
        <circle key={i} cx={m.x} cy={m.y} r="4" fill={C.cream} stroke={C.tan} strokeWidth="1.2" />
      ))}
      <text x={cx} y={cy - 9} textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '30px', fontWeight: 400, fill: C.espresso }}>
        {timeStr}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fill: C.espressoMid, letterSpacing: '0.05em' }}>
        {step}
      </text>
    </svg>
  );
}

function stepLabel(elapsed: number, total: number, steps: ArcStep[]): string {
  if (elapsed === 0) return 'Ready';
  if (elapsed >= total) return '— Done —';
  if (steps.length > 0) {
    const current = steps.find((s) => elapsed <= s.targetTime);
    return current?.label ?? 'Extracting';
  }
  if (elapsed <= 5) return 'Pre-infuse';
  if (elapsed <= 10) return 'Bloom';
  return 'Extracting';
}
