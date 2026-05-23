// Map.jsx — Screen 1: parade route map (hero)
// Stylized hand-drawn route from Drayton Park → Islington Town Hall.
// Dark warm-black ground with subtle stipple. Route as warm gold line.
// "You are here" GPS dot pulses gently. Landmarks as small labeled dots.

function MapScreen() {
  return (
    <ShippieShell time="13:47" wordmarkMeta="parade · 25.05.25">
      <MapHeader />
      <MapCanvas />
      <MapInfoBar />
    </ShippieShell>
  );
}

// ─── Header ─────────────────────────────────────────────────
function MapHeader() {
  return (
    <div style={{ padding: '12px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* small trophy mark — abstract goblet, no Arsenal logo */}
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none" style={{ marginTop: 2, flexShrink: 0 }}>
            <path d="M3 1h8v3a4 4 0 11-8 0V1z" stroke="var(--gold)" strokeWidth="1.2"/>
            <path d="M1 2.5h2M11 2.5h2" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="square"/>
            <path d="M7 8v3M4.5 11h5M5 13.5h4" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="square"/>
          </svg>
          <h1 className="serif" style={{
            margin: 0, fontSize: 24, fontWeight: 500, lineHeight: 1.05,
            color: 'var(--ink)', letterSpacing: '-0.01em',
            fontStyle: 'italic', fontVariationSettings: '"opsz" 144',
            whiteSpace: 'nowrap',
          }}>
            Champions <span style={{ fontStyle: 'normal', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 16, letterSpacing: '0.02em' }}>24/25</span>
          </h1>
        </div>
        <div className="mono" style={{
          marginTop: 6, fontSize: 10, letterSpacing: '0.02em',
          color: 'var(--ink-mute)',
        }}>
          gps works offline · no signal needed
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        {/* layers / info icons — small, sharp, no chrome */}
        <button style={iconBtnStyle} aria-label="Layers">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2L1.5 5.5 8 9l6.5-3.5L8 2z"/>
            <path d="M1.5 9L8 12.5 14.5 9" />
            <path d="M1.5 12.5L8 16l6.5-3.5" opacity="0.4"/>
          </svg>
        </button>
        <button style={iconBtnStyle} aria-label="Info">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5v.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
const iconBtnStyle = {
  width: 32, height: 32, background: 'transparent',
  border: '1px solid rgba(20,18,15,0.18)',
  color: 'var(--ink-dim)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
};

// ─── Map canvas with route + landmarks ──────────────────────
function MapCanvas() {
  // Route waypoints in viewBox space (0..400 × 0..560)
  // Drayton Park (top-left) → Holloway Rd → Highbury Corner → Upper St → Town Hall (bottom-right)
  const pathD = `
    M 78 70
    C 110 84, 142 100, 170 132
    S 218 196, 240 232
    C 252 256, 252 282, 246 308
    C 240 336, 234 364, 244 396
    S 280 460, 312 498
  `;
  // ticks along the route (rough positions)
  const dots = [
    { x: 78,  y: 70,  label: 'Drayton Park',          kind: 'start',   side: 'right' },
    { x: 165, y: 128, label: 'Holloway Rd',           kind: 'now',     side: 'right' },
    { x: 240, y: 232, label: 'Highbury & Islington',  kind: 'station', side: 'right' },
    { x: 244, y: 308, label: 'Highbury Corner',       kind: 'meet',    side: 'left'  },
    { x: 238, y: 376, label: 'Angel',                 kind: 'closed',  side: 'left'  },
    { x: 286, y: 460, label: 'Town Hall',             kind: 'end',     side: 'right' },
  ];

  // First-aid + closure markers (not on the route)
  const aux = [
    { x: 124, y: 168, type: 'aid',     label: 'first aid' },
    { x: 280, y: 280, type: 'aid',     label: 'first aid' },
    { x: 200, y: 420, type: 'closure', label: 'rd closed' },
    { x: 320, y: 380, type: 'star',    label: 'meet pt' },
  ];

  return (
    <div className="stipple" style={{
      flex: 1, position: 'relative', overflow: 'hidden',
      background: 'var(--paper)',
    }}>
      {/* subtle compass grid — very low contrast */}
      <svg width="100%" height="100%" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice"
           style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(20,18,15,0.07)" strokeWidth="0.5"/>
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="0%"  stopColor="rgba(20,18,15,0)"/>
            <stop offset="100%" stopColor="rgba(20,18,15,0.1)"/>
          </radialGradient>
        </defs>
        <rect width="400" height="560" fill="url(#grid)"/>

        {/* river-style abstract roads (background streets) */}
        <g stroke="rgba(20,18,15,0.12)" strokeWidth="1.2" fill="none" strokeLinecap="round">
          <path d="M -10 200 C 80 210, 160 210, 240 220 S 380 220, 420 230"/>
          <path d="M -10 360 C 60 340, 140 350, 220 360 S 380 370, 420 360"/>
          <path d="M 60 -10 C 70 80, 92 150, 110 230 S 140 420, 130 570"/>
          <path d="M 320 -10 C 326 80, 320 180, 314 280 S 300 460, 320 570"/>
        </g>

        {/* faint underglow under the route — Arsenal red */}
        <path d={pathD} stroke="rgba(239,1,7,0.22)" strokeWidth="8" fill="none" strokeLinecap="round"/>
        {/* route — main red line */}
        <path d={pathD} stroke="var(--red)" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
        {/* route — dotted "remaining" segment after current position */}
        <path d={pathD} stroke="var(--ink)" strokeWidth="2.4" fill="none"
              strokeDasharray="0 700 1000" strokeLinecap="round" opacity="0.0"/>

        {/* progressed segment overlay — gold solid; remaining is dashed */}
        <path d={pathD} stroke="var(--ink)" strokeWidth="3" fill="none"
              strokeDasharray="180 600" strokeLinecap="butt" opacity="0"/>

        {/* route endpoints — start as open red ring, end as cream pin with red core */}
        <circle cx="78"  cy="70"  r="3.5" fill="var(--ink)" stroke="var(--red)" strokeWidth="1.5"/>
        <circle cx="286" cy="460" r="5"   fill="var(--red)" stroke="var(--ink)" strokeWidth="1.5"/>
        <circle cx="286" cy="460" r="9"   fill="none" stroke="var(--red)" strokeWidth="1" opacity="0.5"/>

        {/* aux markers (small) */}
        {aux.map((m, i) => (
          <AuxMarker key={i} {...m} />
        ))}

        {/* vignette overlay last */}
        <rect width="400" height="560" fill="url(#vignette)" pointerEvents="none"/>
      </svg>

      {/* HTML-positioned dots + labels (so typography is crisp) */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {dots.map((d, i) => (
          <Landmark key={i} {...d} />
        ))}
        {/* "You are here" — overrides Holloway Rd location */}
        <GpsHere x={165} y={128} />
      </div>

      {/* north indicator */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(20,18,15,0.18)',
      }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3 L13 13 L10 11 L7 13 Z" fill="var(--ink)" />
          <text x="10" y="18" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="6" fill="var(--ink-mute)">N</text>
        </svg>
      </div>

      {/* scale bar */}
      <div style={{
        position: 'absolute', bottom: 12, left: 16,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 48, height: 1, background: 'var(--ink-mute)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: -3, width: 1, height: 7, background: 'var(--ink-mute)' }} />
          <div style={{ position: 'absolute', right: 0, top: -3, width: 1, height: 7, background: 'var(--ink-mute)' }} />
        </div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.05em' }}>200m</span>
      </div>

      {/* corner coords — local-first detail */}
      <div className="mono" style={{
        position: 'absolute', top: 12, left: 16,
        fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.04em', lineHeight: 1.4,
      }}>
        51.5536°N<br/>−0.1090°W
      </div>
    </div>
  );
}

// landmark dot + label
function Landmark({ x, y, label, kind, side }) {
  // skip rendering for 'now' (replaced by GpsHere)
  if (kind === 'now') return null;

  const isStation = kind === 'station' || kind === 'closed';
  const isOpen = kind === 'station';
  const isMeet = kind === 'meet';
  const isEnd  = kind === 'end';
  const isStart = kind === 'start';

  const dot = isMeet
    ? <Star />
    : isEnd
      ? null /* handled in svg */
      : isStart
        ? null
        : (
          <div style={{
            width: 7, height: 7, background: isOpen ? 'var(--sage)' : 'rgba(20,18,15,0.5)',
            border: '1px solid var(--ink)',
            position: 'relative',
          }}>
            {!isOpen && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(45deg, transparent 46%, var(--red) 46%, var(--red) 54%, transparent 54%)',
              }} />
            )}
          </div>
        );

  const labelStyle = {
    position: 'absolute',
    top: side === 'right' ? -4 : -4,
    left: side === 'right' ? 14 : 'auto',
    right: side === 'left' ? 14 : 'auto',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--mono)',
    fontSize: 9.5, letterSpacing: '0.04em',
    color: 'var(--ink-dim)',
    textTransform: 'uppercase',
    pointerEvents: 'none',
  };
  const checkStyle = {
    fontSize: 9, marginLeft: 5,
    color: isOpen ? 'var(--sage)' : 'var(--red)',
    fontFamily: 'var(--mono)',
  };

  // viewBox is 400×560 but positioned as percent of the actual container
  const left = `${(x / 400) * 100}%`;
  const top  = `${(y / 560) * 100}%`;

  return (
    <div style={{
      position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
      display: 'flex', alignItems: 'center',
    }}>
      {dot}
      <span style={labelStyle}>
        {label}
        {isStation && <span style={checkStyle}>{isOpen ? '✓' : '✗'}</span>}
        {isMeet && <span style={{ ...checkStyle, color: 'var(--gold)' }}>★</span>}
      </span>
    </div>
  );
}

function Star() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11">
      <path d="M5.5 0.5L6.8 4L10.5 4L7.5 6.3L8.6 9.8L5.5 7.6L2.4 9.8L3.5 6.3L0.5 4L4.2 4Z"
            fill="var(--gold)" stroke="var(--ink)" strokeWidth="0.5"/>
    </svg>
  );
}

function AuxMarker({ x, y, type }) {
  if (type === 'aid') {
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect x="-3" y="-3" width="6" height="6" fill="var(--paper-2)" stroke="rgba(20,18,15,0.4)" strokeWidth="0.6"/>
        <path d="M -1.6 0 H 1.6 M 0 -1.6 V 1.6" stroke="var(--red)" strokeWidth="1.1" strokeLinecap="square"/>
      </g>
    );
  }
  if (type === 'closure') {
    return (
      <g transform={`translate(${x} ${y})`}>
        <circle r="3" fill="var(--paper-2)" stroke="var(--red)" strokeWidth="0.8"/>
        <path d="M -1.6 0 H 1.6" stroke="var(--red)" strokeWidth="1.1" strokeLinecap="round"/>
      </g>
    );
  }
  return null;
}

// "You are here" gps glow
function GpsHere({ x, y }) {
  const left = `${(x / 400) * 100}%`;
  const top  = `${(y / 560) * 100}%`;
  return (
    <div style={{
      position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{ position: 'relative', width: 14, height: 14 }}>
        <div className="gps-ring" />
        <div className="gps-ring delay" />
        <div className="gps-core" />
      </div>
      <div style={{
        marginLeft: 14, position: 'relative',
        fontFamily: 'var(--mono)', fontSize: 9.5,
        color: 'var(--red)', letterSpacing: '0.1em', textTransform: 'uppercase',
        lineHeight: 1.3, fontWeight: 600,
      }}>
        You are here
        <div style={{ color: 'var(--ink-mute)', textTransform: 'none', letterSpacing: '0.03em', fontWeight: 500 }}>holloway rd · 14:34</div>
      </div>
    </div>
  );
}

// ─── Bottom info bar ─────────────────────────────────────────
function MapInfoBar() {
  return (
    <div style={{
      borderTop: '1px solid rgba(20,18,15,0.12)',
      background: 'var(--paper-2)',
      padding: '12px 20px 14px',
      flexShrink: 0,
    }}>
      {/* row 1: bus estimate */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div className="label">Bus eta · your loc</div>
          <div className="mono" style={{
            marginTop: 4, fontSize: 14, color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}>
            Holloway Rd · <span style={{ color: 'var(--red)' }}>~2:34pm</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-pip" />
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            47m away
          </span>
        </div>
      </div>

      {/* row 2: friend dots */}
      <div style={{
        marginTop: 12, paddingTop: 10,
        borderTop: '1px solid rgba(20,18,15,0.07)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span className="label" style={{ flexShrink: 0 }}>group</span>
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <FriendDot ch="S" color="var(--gold)" connected />
          <FriendDot ch="T" color="var(--sage)" connected />
          <FriendDot ch="J" color="rgba(20,18,15,0.32)" />
          <FriendDot ch="L" color="rgba(20,18,15,0.32)" />
        </div>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          2 / 4 linked
        </span>
      </div>
    </div>
  );
}

function FriendDot({ ch, color, connected }) {
  return (
    <div style={{
      width: 22, height: 22,
      background: connected ? color : 'transparent',
      border: connected ? `1px solid ${color}` : `1px dashed rgba(20,18,15,0.3)`,
      color: connected ? 'var(--ink)' : 'rgba(20,18,15,0.4)',
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{ch}</div>
  );
}

Object.assign(window, { MapScreen });
