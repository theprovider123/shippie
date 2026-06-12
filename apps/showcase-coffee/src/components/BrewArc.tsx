// Ported from lot-components.jsx — the circular brew progress arc.
//
// The sweep is no longer React-rendered per second: the progress circle's
// stroke-dashoffset reads the `--brew-arc-offset` CSS variable, which the
// timer (BrewTimer in Brew.tsx) updates per animation frame on a wrapper
// element. This component is memoized with primitive props and only
// re-renders once per second, for the numeral readout and step label.

import { memo } from 'react';
import { C } from '../tokens.ts';

export interface ArcStep {
  label: string;
  targetTime: number; // cumulative seconds
}

export interface BrewArcProps {
  /** Whole seconds elapsed — drives the numeral + done colour, not the sweep. */
  elapsed: number;
  total?: number;
  /** Step label under the numeral (computed by the parent from the recipe). */
  label?: string;
  /** Comma-separated cumulative step times in seconds, e.g. "30,75,120". */
  markers?: string;
  size?: number;
}

export const BrewArc = memo(function BrewArc({ elapsed, total = 28, label = '', markers = '', size = 186 }: BrewArcProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
  const arcColor = elapsed >= total ? C.sage : C.terracotta;

  const markerTimes = (markers ? markers.split(',').map(Number) : [5, 10]).filter((t) => t > 0 && t < total);
  const markerDots = markerTimes.map((t) => {
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
        pathLength={1}
        strokeDasharray="1"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ strokeDashoffset: 'var(--brew-arc-offset, 1)', transition: 'stroke 0.4s ease' }}
      />
      {markerDots.map((m, i) => (
        <circle key={i} cx={m.x} cy={m.y} r="4" fill={C.cream} stroke={C.tan} strokeWidth="1.2" />
      ))}
      <text x={cx} y={cy - 9} textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '30px', fontWeight: 400, fill: C.espresso }}>
        {timeStr}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fill: C.espressoMid, letterSpacing: '0.05em' }}>
        {label}
      </text>
    </svg>
  );
});

export function stepLabel(elapsed: number, total: number, steps: ArcStep[]): string {
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
