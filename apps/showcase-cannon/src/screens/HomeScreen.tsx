// HomeScreen (ORACLE) — ported from cannon-home.jsx. UK English, fixed label
// wrapping, shared Divide.
import { useMemo, type CSSProperties } from 'react';
import { Divide, ScreenHeader } from '../components/chrome';
import { NEXT_MATCH, ORACLE, THIS_DAY } from '../data/match';

const homL: CSSProperties = {
  fontFamily: "'Barlow Condensed',sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--cream-dim)',
  whiteSpace: 'nowrap',
};
const homB: CSSProperties = {
  fontFamily: "'Inter',sans-serif",
  fontSize: 14,
  lineHeight: 1.65,
  fontWeight: 400,
  color: 'var(--cream-muted)',
};

export const HomeScreen = () => {
  const daysTo = useMemo(
    () => Math.max(0, Math.ceil((new Date(NEXT_MATCH.kickoffISO).getTime() - Date.now()) / 86400000)),
    [],
  );

  return (
    <div className="screen-enter">
      <ScreenHeader title="ORACLE" />

      {/* ── NEXT MATCH ──────────────────────────────── */}
      <Divide label="Next Match" accent="#EF0107" />
      <div style={{ padding: '0 16px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ height: 3, background: '#EF0107' }} />
          <div style={{ padding: 16 }}>
            {/* Competition + date — both nowrap */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ ...homL }}>{NEXT_MATCH.comp}</span>
              <span style={{ ...homL }}>{NEXT_MATCH.dateLabel}</span>
            </div>
            {/* Teams */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* Arsenal */}
              <div style={{ flex: 1 }}>
                <div style={{ width: 44, height: 44, background: '#EF0107', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 800, color: '#fff' }}>AFC</span>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--cream)', whiteSpace: 'nowrap' }}>
                  Arsenal
                </div>
                <div style={{ ...homL, color: 'var(--gold)', marginTop: 2 }}>Champions</div>
              </div>
              {/* Countdown */}
              <div style={{ textAlign: 'center', width: 80, flexShrink: 0 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 52, fontWeight: 800, lineHeight: 1, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                  {daysTo}
                </div>
                <div style={{ ...homL, marginTop: 3 }}>Days</div>
              </div>
              {/* Man City — flex-end via textAlign, NOT alignItems */}
              <div style={{ flex: 1 }}>
                <div style={{ width: 44, height: 44, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, marginLeft: 'auto' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 800, color: 'var(--cream-dim)' }}>
                    {NEXT_MATCH.opponentShort}
                  </span>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--cream)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {NEXT_MATCH.opponent}
                </div>
                <div style={{ ...homL, marginTop: 2, textAlign: 'right' }}>Opposition</div>
              </div>
            </div>
            {/* Fan confidence */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ ...homL }}>Fan Confidence</span>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--gold-light)' }}>
                  {NEXT_MATCH.fanConfidence}%
                </span>
              </div>
              <div style={{ height: 3, background: 'var(--raised)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${NEXT_MATCH.fanConfidence}%`, height: '100%', background: 'linear-gradient(90deg,#EF0107,#C4982A)', borderRadius: 3 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ORACLE ANALYSIS ─────────────────────────── */}
      <Divide label="Oracle Analysis" accent="var(--gold)" />
      <div style={{ padding: '0 16px' }}>
        <div style={{ background: '#FFFDF7', border: '1px solid rgba(184,150,62,0.2)', borderLeft: '3px solid var(--gold)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ ...homL, color: 'var(--gold)' }}>{ORACLE.phase}</span>
            <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
          </div>
          <p style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.7, color: 'var(--cream)', marginBottom: 16 }}>
            "{ORACLE.quote}"
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, paddingTop: 12, borderTop: '1px solid rgba(184,150,62,0.14)' }}>
            <div>
              <div style={{ ...homL, marginBottom: 4 }}>Confidence</div>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 800, color: 'var(--gold-light)' }}>
                {ORACLE.confidence}%
              </span>
            </div>
            <div style={{ width: 1, height: 32, background: 'rgba(184,150,62,0.18)' }} />
            <div>
              <div style={{ ...homL, marginBottom: 4, whiteSpace: 'nowrap' }}>Key Battle</div>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--cream-muted)', whiteSpace: 'nowrap' }}>
                {ORACLE.keyBattle}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── THIS DAY IN ARSENAL ─────────────────────── */}
      <Divide label="This Day in Arsenal" />
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{ background: '#EF0107', padding: '0 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 64 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{THIS_DAY.day}</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {THIS_DAY.month}
            </div>
          </div>
          <div style={{ padding: '14px 16px', flex: 1 }}>
            <p style={{ ...homB }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{THIS_DAY.year} — </span>
              {THIS_DAY.text}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
