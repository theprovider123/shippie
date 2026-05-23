// Group.jsx — Screen 2: pre-agreed meeting points + hotspot status
// Card-based, sharp corners, dark.

function GroupScreen() {
  return (
    <ShippieShell time="13:47" wordmarkMeta="5 on tour">
      <GroupHeader />
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 24px' }}>
        <MeetingCards />
        <HotspotStatus />
        <FindMyGroup />
      </div>
    </ShippieShell>
  );
}

function GroupHeader() {
  return (
    <div style={{ padding: '8px 20px 16px' }}>
      <div className="label">group</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <h1 className="serif" style={{
          margin: 0, fontSize: 30, fontWeight: 500,
          fontStyle: 'italic', color: 'var(--ink)',
          letterSpacing: '-0.015em', lineHeight: 1,
        }}>The Invincibles</h1>
      </div>
      <div className="mono" style={{
        marginTop: 6, fontSize: 10.5, color: 'var(--ink-mute)', letterSpacing: '0.04em',
      }}>
        5 members · plan locked 6:42am
      </div>
    </div>
  );
}

// ─── Meeting cards ──────────────────────────────────────────
function MeetingCards() {
  const cards = [
    {
      tag: '01',
      kind: 'start',
      title: 'Outside Emirates',
      time: '08:00',
      status: 'done',
      note: 'gates open · gather by east stand',
      meta: '5 / 5 arrived',
    },
    {
      tag: '02',
      kind: 'fallback',
      title: 'Clock tower',
      time: 'every :30',
      status: 'live',
      note: 'if separated · stay 5min, then move',
      meta: 'next check-in',
      countdown: '12:04',
    },
    {
      tag: '03',
      kind: 'end',
      title: 'The Gunners',
      time: '16:00',
      status: 'queued',
      note: 'after parade · table booked for 6',
      meta: 'in 2h 13m',
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {cards.map((c, i) => <MeetingCard key={i} {...c} />)}
    </div>
  );
}

function MeetingCard({ tag, kind, title, time, status, note, meta, countdown }) {
  const accent = status === 'done' ? 'var(--sage)'
              : status === 'live' ? 'var(--red)'
              : 'rgba(20,18,15,0.4)';
  return (
    <div style={{
      background: status === 'live' ? 'rgba(239,1,7,0.05)' : 'var(--paper-2)',
      border: '1px solid',
      borderColor: status === 'live' ? 'rgba(239,1,7,0.4)' : 'rgba(20,18,15,0.12)',
      padding: '14px 16px',
      position: 'relative',
    }}>
      {/* left accent strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 2, background: accent,
      }} />

      {/* top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
              {tag}
            </span>
            <span className="mono" style={{
              fontSize: 9.5, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {status === 'done' ? '✓ done' : status === 'live' ? '● live' : '⏱ queued'}
            </span>
          </div>
          <h3 className="serif" style={{
            margin: '4px 0 0', fontSize: 20, fontWeight: 500,
            color: 'var(--ink)', letterSpacing: '-0.01em', lineHeight: 1.15,
          }}>{title}</h3>
          <div className="mono" style={{
            marginTop: 6, fontSize: 10.5, color: 'var(--ink-dim)', letterSpacing: '0.02em',
          }}>{note}</div>
        </div>

        {/* tiny map snippet */}
        <MiniMap kind={kind} />
      </div>

      {/* bottom row */}
      <div style={{
        marginTop: 14, paddingTop: 10,
        borderTop: '1px solid rgba(20,18,15,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12,
      }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {meta}
        </div>
        <div className="mono" style={{ fontSize: 13, color: status === 'live' ? 'var(--red)' : 'var(--ink)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {countdown && <span className="live-pip" />}
          {countdown || time}
        </div>
      </div>
    </div>
  );
}

function MiniMap({ kind }) {
  // tiny 56×56 map snippet
  const variants = {
    start:    { path: 'M 8 40 L 22 26 L 36 22 L 50 8',  pin: [50, 8] },
    fallback: { path: 'M 8 28 C 22 28, 34 28, 48 28',   pin: [28, 28] },
    end:      { path: 'M 8 8 L 22 22 L 36 40 L 50 48',  pin: [50, 48] },
  }[kind];
  return (
    <div style={{
      width: 56, height: 56, flexShrink: 0,
      background: 'var(--paper-2)', border: '1px solid rgba(20,18,15,0.12)',
      position: 'relative', overflow: 'hidden',
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ position: 'absolute', inset: 0 }}>
        {/* faint streets */}
        <path d="M -5 18 L 60 22 M -5 38 L 60 36 M 16 -5 L 18 60 M 40 -5 L 38 60"
              stroke="rgba(20,18,15,0.12)" strokeWidth="0.5"/>
        <path d={variants.path} stroke="var(--red)" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <circle cx={variants.pin[0]} cy={variants.pin[1]} r="2" fill="var(--red)"/>
        <circle cx={variants.pin[0]} cy={variants.pin[1]} r="4" fill="none" stroke="var(--red)" strokeWidth="0.6" opacity="0.5"/>
      </svg>
    </div>
  );
}

// ─── Hotspot status ──────────────────────────────────────────
function HotspotStatus() {
  return (
    <div style={{ marginTop: 26 }}>
      <div className="label" style={{ marginBottom: 10 }}>Hotspot · local mesh</div>
      <div style={{
        background: 'var(--paper-2)',
        border: '1px solid rgba(20,18,15,0.12)',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink)', letterSpacing: '-0.005em' }}>
            <span style={{ color: 'var(--ink-mute)' }}>SSID</span> · Arsenal-Invincibles
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <WifiIcon />
            <span className="mono" style={{ fontSize: 10, color: 'var(--sage)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>linked</span>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PersonRow ch="S" name="Sarah" status="host" detail="Holloway Rd · now" />
          <PersonRow ch="Y" name="You" status="connected" detail="Holloway Rd · now" />
          <PersonRow ch="T" name="Tom" status="connected" detail="Drayton Park · 4m ago" />
          <PersonRow ch="J" name="James" status="lost" detail="Upper Street · 14m ago" />
          <PersonRow ch="L" name="Lucy" status="lost" detail="no last position" />
        </div>
      </div>
    </div>
  );
}

function PersonRow({ ch, name, status, detail }) {
  const isLost = status === 'lost';
  const isHost = status === 'host';
  const color  = isHost ? 'var(--red)' : isLost ? 'rgba(20,18,15,0.32)' : 'var(--sage)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 22, height: 22, flexShrink: 0,
        background: isLost ? 'transparent' : color,
        border: isLost ? '1px dashed rgba(20,18,15,0.3)' : `1px solid ${color}`,
        color: isLost ? 'rgba(20,18,15,0.45)' : (isHost ? 'var(--paper)' : 'var(--ink)'),
        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{ch}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: isLost ? 'var(--ink-mute)' : 'var(--ink)', fontWeight: 500 }}>
          {name}
          {isHost && <span className="mono" style={{ marginLeft: 8, fontSize: 9, color: 'var(--red)', letterSpacing: '0.1em' }}>HOST</span>}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.02em' }}>
          {detail}
        </span>
      </div>
    </div>
  );
}

function WifiIcon() {
  return (
    <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="var(--sage)" strokeWidth="1.2">
      <path d="M1 4.5 C 3 2.5, 5 2, 7 2 S 11 2.5, 13 4.5"/>
      <path d="M3 6.5 C 4.5 5, 6 4.5, 7 4.5 S 9.5 5, 11 6.5"/>
      <circle cx="7" cy="9" r="1" fill="var(--sage)" stroke="none"/>
    </svg>
  );
}

// ─── Audio beacon button ─────────────────────────────────────
function FindMyGroup() {
  return (
    <button style={{
      marginTop: 22, width: '100%',
      background: 'var(--red)',
      border: '1px solid var(--red)',
      color: 'var(--paper)',
      padding: '16px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SoundIcon />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Find my group</span>
      </div>
      <span className="mono" style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
        audio beacon
      </span>
    </button>
  );
}

function SoundIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2 5 H 5 L 9 1 V 13 L 5 9 H 2 Z"/>
      <path d="M12 4.5 C 13.2 5.7, 13.2 8.3, 12 9.5"/>
      <path d="M14.5 2.5 C 17 4.5, 17 9.5, 14.5 11.5"/>
    </svg>
  );
}

Object.assign(window, { GroupScreen });
