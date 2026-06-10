/**
 * Shared chrome — ported from the design source (cannon-shared.jsx):
 * CannonLogo, StatusBar, BottomNav, ScreenHeader, Divide, TimezonePicker.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { getHandle } from '../lib/handle';
import { cycleTZ, useTZ } from '../lib/tz';

export type TabId = 'home' | 'terrace' | 'gauge' | 'fixtures' | 'archive';

// ── Arsenal Cannon SVG ───────────────────────────────────────────────────────
export const CannonLogo = ({ color = '#EF0107', height = 26 }: { color?: string; height?: number }) => {
  const w = Math.round(height * 1.78);
  return (
    <svg width={w} height={height} viewBox="0 0 64 36" fill="none">
      <rect x="14" y="3" width="46" height="14" rx="7" fill={color} />
      <circle cx="15" cy="10" r="9.5" fill={color} />
      <rect x="57" y="5" width="5" height="10" rx="2.5" fill={color} />
      <rect x="13" y="17" width="38" height="7" rx="2" fill={color} />
      <rect x="9" y="22" width="46" height="3" rx="1.5" fill={color} opacity="0.7" />
      <circle cx="20" cy="30" r="6" stroke={color} strokeWidth="2.5" fill="none" />
      <circle cx="20" cy="30" r="2" fill={color} />
      <line x1="20" y1="24" x2="20" y2="36" stroke={color} strokeWidth="1.5" />
      <line x1="14" y1="30" x2="26" y2="30" stroke={color} strokeWidth="1.5" />
      <circle cx="46" cy="30" r="6" stroke={color} strokeWidth="2.5" fill="none" />
      <circle cx="46" cy="30" r="2" fill={color} />
      <line x1="46" y1="24" x2="46" y2="36" stroke={color} strokeWidth="1.5" />
      <line x1="40" y1="30" x2="52" y2="30" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

// ── Status Bar ───────────────────────────────────────────────────────────────
function clockNow(): string {
  const n = new Date();
  const h = n.getHours();
  const m = n.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

export const StatusBar = () => {
  const [time, setTime] = useState(clockNow);
  useEffect(() => {
    const id = setInterval(() => setTime(clockNow()), 30000);
    return () => clearInterval(id);
  }, []);
  const ic = 'var(--cream-muted)';
  return (
    <div className="status-bar">
      <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{time}</span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <rect x="0" y="8" width="3" height="4" rx="0.5" fill={ic} />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="0.5" fill={ic} />
          <rect x="9" y="3" width="3" height="9" rx="0.5" fill={ic} />
          <rect x="13.5" y="0" width="2.5" height="12" rx="0.5" fill={ic} opacity="0.3" />
        </svg>
        <svg width="15" height="12" viewBox="0 0 15 12" fill="none">
          <path d="M7.5 10a1 1 0 100 2 1 1 0 000-2z" fill={ic} />
          <path d="M4.5 7.5a4.5 4.5 0 016 0" stroke={ic} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M2 5a7.5 7.5 0 0111 0" stroke={ic} strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
        </svg>
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
          <rect x="0.5" y="0.5" width="18" height="11" rx="3" stroke={ic} strokeWidth="1" />
          <rect x="2" y="2" width="13" height="8" rx="1.5" fill={ic} />
          <path d="M19.5 4v4a2 2 0 000-4z" fill={ic} opacity="0.35" />
        </svg>
      </div>
    </div>
  );
};

// ── Bottom Nav ───────────────────────────────────────────────────────────────
const NAV_TABS: Array<{ id: TabId; label: string; icon: (active: boolean) => ReactNode }> = [
  {
    id: 'home',
    label: 'ORACLE',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#EF0107' : 'var(--cream-dim)'} strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      </svg>
    ),
  },
  {
    id: 'terrace',
    label: 'TERRACE',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#EF0107' : 'var(--cream-dim)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    id: 'gauge',
    label: 'GAUGE',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#EF0107' : 'var(--cream-dim)'} strokeWidth="1.6" strokeLinecap="round">
        <path d="M3 18a9 9 0 1118 0" />
        <path d="M12 18L8 10" />
        <circle cx="12" cy="18" r="1.5" fill={a ? '#EF0107' : 'var(--cream-dim)'} stroke="none" />
      </svg>
    ),
  },
  {
    id: 'fixtures',
    label: 'FIXTURES',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#EF0107' : 'var(--cream-dim)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
  },
  {
    id: 'archive',
    label: 'CLUB',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#EF0107' : 'var(--cream-dim)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h10v11a5 5 0 01-10 0V3z" />
        <path d="M7 6H3v3a4 4 0 004 4v0M17 6h4v3a4 4 0 01-4 4v0" />
        <path d="M12 14v5M9 22h6" />
      </svg>
    ),
  },
];

export const BottomNav = ({ active, onNav }: { active: TabId; onNav: (tab: TabId) => void }) => (
  <nav className="bottom-nav">
    {NAV_TABS.map((tab) => (
      <button
        key={tab.id}
        className={`nav-tab${active === tab.id ? ' active' : ''}`}
        onClick={() => onNav(tab.id)}
      >
        <span className="nav-icon">{tab.icon(active === tab.id)}</span>
        <span className="nav-label" style={{ color: active === tab.id ? '#EF0107' : 'var(--cream-dim)' }}>
          {tab.label}
        </span>
      </button>
    ))}
  </nav>
);

// ── Screen Header ────────────────────────────────────────────────────────────
export const ScreenHeader = ({ title = 'CANNON', right }: { title?: string; right?: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px 10px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <CannonLogo height={24} color="#EF0107" />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--cream-muted)', textTransform: 'uppercase' }}>
          THE
        </span>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', color: '#EF0107', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
    </div>
    {right || (
      <div
        style={{
          background: 'rgba(184,150,62,0.12)',
          border: '1px solid rgba(184,150,62,0.3)',
          borderRadius: 20,
          padding: '3px 10px',
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--gold-light)',
          whiteSpace: 'nowrap',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {getHandle()}
      </div>
    )}
  </div>
);

// ── Section divider ──────────────────────────────────────────────────────────
export const Divide = ({ label, accent = 'var(--cream-dim)' }: { label: string; accent?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 8px' }}>
    <span
      style={{
        fontFamily: "'Barlow Condensed',sans-serif",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: accent,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
  </div>
);

// ── Timezone Picker ──────────────────────────────────────────────────────────
const tzStyle: CSSProperties = {
  background: 'var(--raised)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '4px 10px',
  cursor: 'pointer',
  fontFamily: "'Barlow Condensed',sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  color: 'var(--cream-dim)',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  WebkitTapHighlightColor: 'transparent',
};

export const TimezonePicker = () => {
  const tz = useTZ();
  return (
    <button onClick={() => cycleTZ()} style={tzStyle}>
      {tz} <span style={{ opacity: 0.45, fontSize: 8 }}>▾</span>
    </button>
  );
};
