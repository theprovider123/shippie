/**
 * Shared chrome — the programme masthead, tab bar, section rules, and the
 * small honest-data atoms (stale badge, empty state) every screen leans on.
 */
import type { ReactNode } from 'react';
import { asOfLabel } from '../lib/feeds';
import type { MatchPhase } from '../lib/types';

export type TabId = 'now' | 'matches' | 'terrace' | 'squad';

// ── Arsenal Cannon SVG — original mark, not the club crest ───────────────────
export const CannonLogo = ({ color = '#EF0107', height = 22 }: { color?: string; height?: number }) => {
  const w = Math.round(height * 1.78);
  return (
    <svg width={w} height={height} viewBox="0 0 64 36" fill="none" aria-hidden="true">
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

// ── Masthead ─────────────────────────────────────────────────────────────────
export const Masthead = ({ live, right }: { live?: boolean; right?: ReactNode }) => (
  <header className={`masthead${live ? ' masthead--live' : ''}`}>
    <div className="masthead-brand">
      <CannonLogo color={live ? '#FFFFFF' : '#EF0107'} height={22} />
      <div className="masthead-word">
        <span className="masthead-the">The</span>
        <span className="masthead-name">Cannon</span>
      </div>
    </div>
    <div className="masthead-right">
      {live && (
        <span className="live-chip">
          <span className="live-dot pulse" />
          Live
        </span>
      )}
      {right}
    </div>
  </header>
);

// ── Tab bar ──────────────────────────────────────────────────────────────────
const TAB_DEFS: Array<{ id: TabId; label: string; icon: (a: boolean) => ReactNode }> = [
  {
    id: 'now',
    label: 'Now',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  {
    id: 'matches',
    label: 'Matches',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'terrace',
    label: 'Terrace',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    id: 'squad',
    label: 'Squad',
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export const TabBar = ({ active, onNav }: { active: TabId; onNav: (t: TabId) => void }) => (
  <nav className="tab-bar" aria-label="Sections">
    {TAB_DEFS.map((tab) => (
      <button
        key={tab.id}
        className={`tab-bar-item${active === tab.id ? ' active' : ''}`}
        onClick={() => onNav(tab.id)}
        aria-current={active === tab.id ? 'page' : undefined}
      >
        <span className="tab-bar-icon">{tab.icon(active === tab.id)}</span>
        <span className="tab-bar-label">{tab.label}</span>
      </button>
    ))}
  </nav>
);

// ── Section rule — hairline + micro label, the programme rhythm ──────────────
export const Rule = ({ label, accent, right }: { label: string; accent?: string; right?: ReactNode }) => (
  <div className="rule">
    <span className="rule-label" style={accent ? { color: accent } : undefined}>
      {label}
    </span>
    <span className="rule-line" />
    {right}
  </div>
);

// ── Honest-data atoms ────────────────────────────────────────────────────────
export const StaleBadge = ({ stale, asOf }: { stale: boolean; asOf: string | null }) =>
  stale ? (
    <span className="stale-badge" title="Showing the last copy this device saw">
      {asOfLabel(asOf)}
    </span>
  ) : null;

export const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p className="empty-note">{children}</p>
);

export const PHASE_LABEL: Record<MatchPhase, string> = {
  idle: 'Next up',
  pre: 'Matchday',
  live: 'Live',
  ht: 'Half-time',
  ft: 'Full-time',
};

/** "ARS 2 – 1 NEW"-style score line, opponent-aware of venue. */
export const ScoreLine = ({
  home,
  away,
  opponentShort,
  venue,
}: {
  home: number;
  away: number;
  opponentShort: string;
  venue?: string;
}) => {
  const ours = 'ARS';
  const left = venue === 'A' ? opponentShort : ours;
  const right = venue === 'A' ? ours : opponentShort;
  const leftScore = venue === 'A' ? away : home;
  const rightScore = venue === 'A' ? home : away;
  return (
    <div className="score-line">
      <span className="score-team">{left}</span>
      <span className="score-nums">
        {leftScore}
        <span className="score-dash">–</span>
        {rightScore}
      </span>
      <span className="score-team">{right}</span>
    </div>
  );
};
