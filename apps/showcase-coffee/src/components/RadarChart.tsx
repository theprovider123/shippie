// Ported from lot-components.jsx — five-axis SVG radar, built from scratch
// (no chart library). Data values are 0–5.

import { C } from '../tokens.ts';

export interface RadarChartProps {
  data: number[];
  labels: string[];
  size?: number;
  color?: string;
}

export function RadarChart({ data, labels, size = 140, color = C.terracotta }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const n = labels.length;
  const ang = (i: number): number => (i * 2 * Math.PI) / n - Math.PI / 2;
  const coord = (val: number, i: number): { x: number; y: number } => {
    const a = ang(i);
    const rv = (val / 5) * r;
    return { x: cx + rv * Math.cos(a), y: cy + rv * Math.sin(a) };
  };
  const gridPoly = (lv: number): string =>
    labels
      .map((_, i) => {
        const a = ang(i);
        const rv = (lv / 5) * r;
        return `${cx + rv * Math.cos(a)},${cy + rv * Math.sin(a)}`;
      })
      .join(' ');
  const dataPoly = data.map((v, i) => coord(v, i)).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((lv) => (
        <polygon key={lv} points={gridPoly(lv)} fill="none" stroke={C.tanLight} strokeWidth={lv === 5 ? 0.9 : 0.5} />
      ))}
      {labels.map((_, i) => {
        const a = ang(i);
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke={C.tanLight} strokeWidth="0.5" />;
      })}
      <polygon points={dataPoly} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((v, i) => {
        const p = coord(v, i);
        return <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />;
      })}
      {labels.map((lb, i) => {
        const a = ang(i);
        const lr = r + 16;
        return (
          <text
            key={lb}
            x={cx + lr * Math.cos(a)}
            y={cy + lr * Math.sin(a)}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: '8px', fontFamily: "'DM Sans', sans-serif", fill: C.espressoMid }}
          >
            {lb}
          </text>
        );
      })}
    </svg>
  );
}
