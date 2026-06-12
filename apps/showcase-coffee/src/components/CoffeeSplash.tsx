// Decorative coffee texture behind the app: the two splash blobs plus a
// sparse, deterministic scatter of coffee beans (fixed positions — never
// Math.random at render). Pure static SVG, no filters, pointer-events: none;
// the only motion is the one-off splashEnter/beansEnter fade, disabled under
// prefers-reduced-motion (see styles.css).

const BEAN_BROWN = '#6b3a14';

// A couple of beans per corner region, slightly rotated, at paper-decoration
// opacity (0.05–0.08). Deterministic by design.
const BEANS: ReadonlyArray<{ left: string; top: string; size: number; rot: number; opacity: number }> = [
  // top-left
  { left: '5%', top: '11%', size: 22, rot: -24, opacity: 0.07 },
  { left: '13%', top: '20%', size: 15, rot: 42, opacity: 0.05 },
  // top-right
  { left: '86%', top: '7%', size: 19, rot: 14, opacity: 0.06 },
  { left: '91%', top: '17%', size: 14, rot: -52, opacity: 0.05 },
  // bottom-left
  { left: '7%', top: '74%', size: 17, rot: 68, opacity: 0.06 },
  { left: '13%', top: '85%', size: 23, rot: -12, opacity: 0.08 },
  // bottom-right
  { left: '84%', top: '70%', size: 18, rot: 28, opacity: 0.06 },
  { left: '76%', top: '82%', size: 14, rot: -36, opacity: 0.05 },
];

function Bean({ left, top, size, rot, opacity }: (typeof BEANS)[number]) {
  return (
    <svg
      viewBox="0 0 24 32"
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: (size * 32) / 24,
        transform: `rotate(${rot}deg)`,
        opacity,
      }}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="16" rx="10" ry="14" fill={BEAN_BROWN} />
      {/* centre crease, drawn in the cream ground so it reads as a gap */}
      <path d="M12 4 C 9 12, 15 20, 12 28" fill="none" stroke="#F4EFE3" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function CoffeeSplash() {
  return (
    <>
      <svg className="coffee-splash coffee-splash-large" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill={BEAN_BROWN}>
          <path d="M120,20 C200,10 260,80 230,155 C200,230 120,250 60,200 C0,150 -20,60 60,20 C80,12 100,22 120,20Z" opacity="0.9" />
          <circle cx="218" cy="80" r="14" opacity="0.85" />
          <circle cx="232" cy="130" r="10" opacity="0.8" />
          <circle cx="190" cy="205" r="12" opacity="0.75" />
          <circle cx="75" cy="215" r="9" opacity="0.7" />
          <ellipse cx="95" cy="75" rx="38" ry="22" fill="rgba(255,210,160,0.18)" transform="rotate(-22 95 75)" />
        </g>
      </svg>
      <svg className="coffee-splash coffee-splash-small" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill={BEAN_BROWN}>
          <path d="M60,8 C100,5 125,40 110,75 C95,110 55,120 25,100 C-5,80 -5,30 25,12 C38,5 50,10 60,8Z" opacity="0.9" />
          <circle cx="112" cy="38" r="8" opacity="0.8" />
          <circle cx="105" cy="68" r="6" opacity="0.75" />
          <circle cx="30" cy="108" r="5" opacity="0.7" />
          <ellipse cx="42" cy="38" rx="18" ry="10" fill="rgba(255,210,160,0.18)" transform="rotate(-18 42 38)" />
        </g>
      </svg>
      <div className="coffee-beans" aria-hidden="true">
        {BEANS.map((b, i) => (
          <Bean key={i} {...b} />
        ))}
      </div>
    </>
  );
}
