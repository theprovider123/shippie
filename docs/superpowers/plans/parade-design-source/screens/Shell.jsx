// Shell.jsx — Shippie phone shell (sharp corners, status bar, home indicator)
// Used as the device frame for the 4 mobile screens. Replaces the iOS rounded frame
// because the brand is explicitly sharp-cornered everywhere.

function ShippieStatusBar({ time = '13:47' }) {
  return (
    <div className="status-bar">
      <span className="mono">{time}</span>
      <div className="ind">
        {/* offline indicator — small slashed-signal mark */}
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
          <rect x="0"  y="7" width="2" height="3" fill="var(--ink-faint)" />
          <rect x="3" y="5" width="2" height="5" fill="var(--ink-faint)" />
          <rect x="6" y="3" width="2" height="7" fill="var(--ink-faint)" />
          <rect x="9" y="0" width="2" height="10" fill="var(--ink-faint)" />
          <line x1="-1" y1="11" x2="13" y2="-1" stroke="var(--red)" strokeWidth="1.2"/>
        </svg>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.06em' }}>offline</span>
        <span style={{ width: 8 }} />
        {/* battery */}
        <svg width="22" height="10" viewBox="0 0 22 10">
          <rect x="0.5" y="0.5" width="18" height="9" fill="none" stroke="var(--ink-mute)" />
          <rect x="2" y="2" width="11" height="6" fill="var(--ink)" />
          <rect x="19" y="3" width="1.5" height="4" fill="var(--ink-mute)" />
        </svg>
      </div>
    </div>
  );
}

function ArsenalWordmark({ meta = 'parade · 25.05.25' }) {
  return (
    <div className="wordmark-band">
      <span className="mark">A · R · S · E · N · A · L</span>
      <div className="rule" />
      <span className="meta">{meta}</span>
    </div>
  );
}

function ShippieShell({ children, time = '13:47', noStatus = false, wordmarkMeta }) {
  return (
    <div className="shippie-screen">
      {!noStatus && <ShippieStatusBar time={time} />}
      <ArsenalWordmark meta={wordmarkMeta} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <div className="home-indicator" />
    </div>
  );
}

Object.assign(window, { ShippieShell, ShippieStatusBar, ArsenalWordmark });
