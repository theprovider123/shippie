// Info.jsx — Screen 4: practical parade information.
// No cards. Pure typography. Generous spacing. Mono labels.

function InfoScreen() {
  return (
    <ShippieShell time="13:47" wordmarkMeta="info · v0.4.1">
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px 28px' }}>
        <InfoHeader />
        <Section label="01 / Route">
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink)', letterSpacing: '0', lineHeight: 1.75 }}>
            Drayton Park
            <br /><span style={{ color: 'var(--red)' }}>↓</span>
            <span style={{ color: 'var(--ink-mute)' }}>  0.4mi · 8m</span>
            <br />Holloway Road
            <br /><span style={{ color: 'var(--red)' }}>↓</span>
            <span style={{ color: 'var(--ink-mute)' }}>  0.7mi · 14m</span>
            <br />Highbury Corner
            <br /><span style={{ color: 'var(--red)' }}>↓</span>
            <span style={{ color: 'var(--ink-mute)' }}>  0.6mi · 12m</span>
            <br />Upper Street
            <br /><span style={{ color: 'var(--red)' }}>↓</span>
            <span style={{ color: 'var(--ink-mute)' }}>  0.3mi · 6m</span>
            <br />Islington Town Hall
          </div>
        </Section>

        <Section label="02 / Timing">
          <Row k="Gates"  v="07:00" />
          <Row k="Bus departs" v="~13:00" />
          <Row k="ETA at your location" v="14:34" hint="GPS" accent />
          <Row k="Stage program" v="15:30 — 17:00" />
        </Section>

        <Section label="03 / Transport">
          <Row k="Drayton Park" v="closed" warn />
          <Row k="Highbury & Islington" v="open" ok />
          <Row k="Holloway Road" v="exit only" warn />
          <Row k="Angel"          v="closed" warn />
          <Row k="Arsenal"         v="closed" warn />
        </Section>

        <Section label="04 / Road closures">
          <Row k="Holloway Rd" v="11:00 — 18:00" />
          <Row k="Upper St"    v="12:00 — 19:00" />
          <Row k="Highbury Corner" v="11:30 — 18:30" />
          <Row k="Pentonville Rd"  v="13:00 — 17:00" />
        </Section>

        <Section label="05 / Safety">
          <p style={pStyle}>
            Flares prohibited. If you see one, move upwind.
            First aid points marked <span className="mono" style={{ color: 'var(--red)' }}>+</span> on the map.
          </p>
          <p style={pStyle}>
            Emergency meeting point: <span className="mono" style={{ color: 'var(--red)' }}>Highbury Fields, NE corner.</span>
          </p>
        </Section>

        <Section label="06 / Your phone">
          <p style={pStyle}>
            GPS works without signal. Your position is read directly from satellites.
          </p>
          <p style={pStyle}>
            This app is cached on your phone. Map tiles, group plan, and the celebrate button — everything you see — works offline.
          </p>
          <p style={{ ...pStyle, color: 'var(--ink-mute)' }}>
            Your card stays on your device until you choose to share it.
          </p>
        </Section>

        <Footer />
      </div>
    </ShippieShell>
  );
}

function InfoHeader() {
  return (
    <div style={{ paddingTop: 8, paddingBottom: 24 }}>
      <div className="label">Info</div>
      <h1 className="serif" style={{
        margin: '4px 0 0', fontSize: 32, fontWeight: 500,
        fontStyle: 'italic', color: 'var(--ink)',
        letterSpacing: '-0.015em', lineHeight: 1,
      }}>The full plan</h1>
      <div className="mono" style={{
        marginTop: 10, fontSize: 10.5, color: 'var(--ink-mute)', letterSpacing: '0.04em',
        lineHeight: 1.55,
      }}>
        last cached · sun 26 may, 02:14 utc<br/>
        all sections work offline
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="label" style={{ marginBottom: 12, color: 'var(--red)' }}>{label}</div>
      <div style={{ borderTop: '1px solid rgba(239,1,7,0.25)', paddingTop: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, accent, ok, warn, hint }) {
  const color = ok ? 'var(--sage)' : warn ? 'var(--red)' : accent ? 'var(--red)' : 'var(--ink)';
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 12, padding: '7px 0',
      borderBottom: '1px solid rgba(20,18,15,0.08)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--ink-dim)', letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{k}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {hint && <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{hint}</span>}
        <span className="mono" style={{ fontSize: 12, color, letterSpacing: '-0.01em' }}>{v}</span>
      </span>
    </div>
  );
}

const pStyle = {
  margin: '0 0 10px',
  fontSize: 13.5, lineHeight: 1.55,
  color: 'var(--ink-dim)',
  textWrap: 'pretty',
};

function Footer() {
  return (
    <div style={{
      marginTop: 8, paddingTop: 24,
      borderTop: '2px solid var(--red)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* rocket — Shippie mark */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19 L 8 14 M 4 17 L 5 18"/>
            <path d="M 8 14 L 16 6 L 18 4 L 20 2 L 18 6 L 10 14 Z"/>
            <circle cx="14" cy="8" r="1.5"/>
            <path d="M 12 12 L 14 14"/>
          </svg>
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink)', letterSpacing: '0.06em', fontWeight: 600 }}>
              shippie.app/parade
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.14em', marginTop: 3, textTransform: 'uppercase' }}>
              local-first · offline by design
            </div>
          </div>
        </div>
        <div className="mono" style={{
          fontSize: 10, color: 'var(--red)', letterSpacing: '0.14em', textAlign: 'right',
          lineHeight: 1.4, fontWeight: 600, textTransform: 'uppercase',
        }}>
          no signal.<br/>no problem.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { InfoScreen });
