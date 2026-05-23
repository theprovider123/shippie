// Celebrate.jsx — Screen 3: pure joy tap button
// Massive gold circular button in center. Two visible states (resting + tapped)
// shown as two artboards on the canvas; live state cycles on tap.

function CelebrateScreen({ tapped: tappedProp = false, count = 847 }) {
  const [taps, setTaps] = React.useState(count);
  const [recent, setRecent] = React.useState(23);
  const [pressed, setPressed] = React.useState(tappedProp);
  const [ripples, setRipples] = React.useState([]);

  // sync prop on mount (static artboard variants)
  React.useEffect(() => { setPressed(tappedProp); }, [tappedProp]);

  const onTap = () => {
    setTaps((t) => t + 1);
    setRecent((r) => r + 1);
    setPressed(true);
    const id = Math.random();
    setRipples((rs) => [...rs, id]);
    setTimeout(() => setRipples((rs) => rs.filter((x) => x !== id)), 900);
    setTimeout(() => setPressed(false), 140);
  };

  return (
    <ShippieShell time="13:47" wordmarkMeta="· keep tapping ·">
      {/* top eyebrow */}
      <div style={{ padding: '6px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">Celebrate</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-pip" />
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            live
          </span>
        </div>
      </div>

      {/* "CHAMPIONS" title */}
      <div style={{ padding: '20px 20px 0', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          padding: '0 0 2px',
        }}>
          <TrophyMark />
          <h1 className="serif" style={{
            margin: 0, fontSize: 40, fontWeight: 600,
            color: 'var(--red)', letterSpacing: '-0.01em',
            fontStyle: 'italic',
          }}>Champions</h1>
        </div>
        <div className="mono" style={{
          marginTop: 4, fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.24em',
        }}>
          PREMIER LEAGUE · 2024 / 25
        </div>
      </div>

      {/* button */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <TapButton pressed={pressed} ripples={ripples} onTap={onTap} />
      </div>

      {/* stats */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
          <Stat label="your celebrations" value={taps.toLocaleString()} accent />
          <div style={{ width: 1, background: 'rgba(20,18,15,0.12)' }} />
          <Stat label="taps · this minute" value={recent} />
        </div>
        <div className="mono" style={{
          marginTop: 22, textAlign: 'center', fontSize: 10, letterSpacing: '0.06em',
          color: 'var(--ink-mute)',
        }}>
          your parade story will generate after the event ↓
        </div>
      </div>
    </ShippieShell>
  );
}

function TapButton({ pressed, ripples, onTap }) {
  const size = pressed ? 222 : 232;
  return (
    <div style={{
      position: 'relative', width: 260, height: 260,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* outer halo */}
      <div style={{
        position: 'absolute', width: 260, height: 260, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(237,187,74,0.22), rgba(237,187,74,0) 60%)',
        animation: 'goldHalo 2.4s ease-in-out infinite',
      }} />
      {/* outer dashed ring */}
      <div style={{
        position: 'absolute', width: 250, height: 250, borderRadius: '50%',
        border: '1px dashed rgba(237,187,74,0.35)',
      }} />

      {/* live ripples */}
      {ripples.map((id) => (
        <div key={id} style={{
          position: 'absolute', width: 232, height: 232, borderRadius: '50%',
          border: '2px solid var(--gold)',
          animation: 'goldRipple 0.9s ease-out forwards',
          pointerEvents: 'none',
        }} />
      ))}

      {/* main button */}
      <button onClick={onTap}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: pressed
            ? 'radial-gradient(circle at 50% 60%, #C99A2C 0%, #A37918 100%)'
            : 'radial-gradient(circle at 50% 40%, #F0C460 0%, #C99A2C 70%, #A37918 100%)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: pressed
            ? 'inset 0 6px 18px rgba(0,0,0,0.35), 0 0 32px rgba(237,187,74,0.25)'
            : '0 4px 0 #8C6912, 0 14px 36px rgba(140,105,18,0.28), inset 0 -6px 0 rgba(0,0,0,0.16), inset 0 2px 1px rgba(255,255,255,0.38)',
          transform: pressed ? 'translateY(3px)' : 'translateY(0)',
          transition: 'transform 80ms ease-out, width 80ms ease-out, height 80ms ease-out, box-shadow 80ms ease-out, background 80ms ease-out',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
        {/* subtle radial sheen */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 15%, rgba(255,250,235,0.45), transparent 50%)',
          pointerEvents: 'none',
        }} />
        {/* embossed inner ring */}
        <div style={{
          position: 'absolute', inset: 16, borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.18)',
          boxShadow: 'inset 0 0 0 1px rgba(255,250,235,0.18)',
        }} />
        {/* huge trophy mark inside */}
        <BigTrophy />
      </button>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="mono" style={{
        fontSize: 28, color: accent ? 'var(--red)' : 'var(--ink)',
        letterSpacing: '-0.02em', lineHeight: 1, fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div className="label" style={{ marginTop: 6 }}>{label}</div>
    </div>
  );
}

function TrophyMark() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
      <path d="M5 1.5h12v4.5a6 6 0 11-12 0V1.5z" stroke="var(--red)" strokeWidth="1.4"/>
      <path d="M1.5 3h3.5M17 3h3.5" stroke="var(--red)" strokeWidth="1.4" strokeLinecap="square"/>
      <path d="M11 13v4M7 17h8M8 21h6M7.5 24h7" stroke="var(--red)" strokeWidth="1.4" strokeLinecap="square"/>
    </svg>
  );
}

function BigTrophy() {
  return (
    <svg width="92" height="108" viewBox="0 0 92 108" fill="none" style={{ position: 'relative', zIndex: 2 }}>
      <path d="M22 6h48v18a24 24 0 11-48 0V6z"
            stroke="rgba(20,18,15,0.85)" strokeWidth="2.2" fill="none"/>
      <path d="M4 12h18M70 12h18"
            stroke="rgba(20,18,15,0.85)" strokeWidth="2.2" strokeLinecap="square"/>
      <path d="M46 50v14" stroke="rgba(20,18,15,0.85)" strokeWidth="2.2"/>
      <path d="M30 64h32" stroke="rgba(20,18,15,0.85)" strokeWidth="2.2" strokeLinecap="square"/>
      <path d="M34 76h24" stroke="rgba(20,18,15,0.85)" strokeWidth="2.2" strokeLinecap="square"/>
      <path d="M32 88h28" stroke="rgba(20,18,15,0.85)" strokeWidth="2.2" strokeLinecap="square"/>
      {/* inner sheen on trophy */}
      <path d="M30 12h6v10a4 4 0 008 0v-10" stroke="rgba(255,250,235,0.45)" strokeWidth="1.4" fill="none"/>
    </svg>
  );
}

Object.assign(window, { CelebrateScreen });
