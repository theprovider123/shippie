// Ported from lot-components.jsx — a generated SVG topographic tile used as
// the origin "map". No external map API; pure contour paths over a gradient.
//
// width/height define the drawing coordinate space (viewBox); the SVG itself
// fills its container (100%/100%, preserveAspectRatio="none") so a fixed
// drawing width never overflows a narrow phone. Give the wrapper a height.

export interface TopoMapProps {
  width?: number;
  height?: number;
}

export function TopoMap({ width = 350, height = 160 }: TopoMapProps) {
  const w = width;
  const h = height;
  const contours = [
    `M 0 ${h * 0.78} C 70 ${h * 0.7} 130 ${h * 0.85} 200 ${h * 0.75} S 290 ${h * 0.65} ${w} ${h * 0.72}`,
    `M 0 ${h * 0.62} C 55 ${h * 0.54} 120 ${h * 0.68} 185 ${h * 0.58} S 275 ${h * 0.48} ${w} ${h * 0.56}`,
    `M 0 ${h * 0.47} C 45 ${h * 0.38} 110 ${h * 0.52} 175 ${h * 0.42} S 262 ${h * 0.32} ${w} ${h * 0.4}`,
    `M 10 ${h * 0.33} C 65 ${h * 0.23} 140 ${h * 0.38} 215 ${h * 0.27} S 295 ${h * 0.17} ${w - 10} ${h * 0.25}`,
    `M 40 ${h * 0.2} C 95 ${h * 0.1} 170 ${h * 0.25} 250 ${h * 0.13} S 318 ${h * 0.04} ${w} ${h * 0.1}`,
    `M 0 ${h * 0.9} C 90 ${h * 0.86} 180 ${h * 0.92} ${w} ${h * 0.88}`,
  ];
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="topoG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C9AA80" />
          <stop offset="60%" stopColor="#A87E58" />
          <stop offset="100%" stopColor="#7B5535" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#topoG)" />
      {contours.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(44,26,14,0.17)" strokeWidth={i < 3 ? 1.1 : 0.75} />
      ))}
      <circle cx={w * 0.38} cy={h * 0.36} r="4.5" fill="rgba(44,26,14,0.14)" />
      <circle cx={w * 0.56} cy={h * 0.27} r="3" fill="rgba(44,26,14,0.11)" />
    </svg>
  );
}
