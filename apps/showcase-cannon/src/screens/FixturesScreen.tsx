// FixturesScreen — ported from cannon-fixtures.jsx. H2H drill-down,
// competition abbreviations, clean rows, timezone-aware kick-offs.
import { useState, type CSSProperties } from 'react';
import { Divide, ScreenHeader, TimezonePicker } from '../components/chrome';
import { COMP_SHORT, DIFF, FIXTURES, MONTHS, MONTH_DATA } from '../data/fixtures';
import { H2H_DATA, RES_COLOR } from '../data/h2h';
import { localiseMatchTime, useTZ } from '../lib/tz';
import type { Fixture } from '../lib/types';

const fixL: CSSProperties = {
  fontFamily: "'Barlow Condensed',sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--cream-dim)',
};

// ── H2H Drill-down view ───────────────────────────────────────────────────────
export const H2HView = ({ fixture, onBack }: { fixture: Fixture; onBack: () => void }) => {
  const tz = useTZ();
  const h2h = H2H_DATA[fixture.opponent];
  const wPct = h2h ? Math.round((h2h.record.w / (h2h.record.w + h2h.record.d + h2h.record.l)) * 100) : 0;

  return (
    <div className="screen-enter" style={{ paddingBottom: 24 }}>
      {/* Back header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} aria-label="Back to fixtures" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-dim)" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          <span style={{ ...fixL, color: 'var(--cream-dim)' }}>Fixtures</span>
        </button>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--cream)', flex: 1 }}>
          Arsenal vs {fixture.opponent}
        </span>
      </div>

      {/* Match info */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${RES_COLOR.W}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { l: 'Competition', v: fixture.comp },
              { l: 'Date', v: fixture.date },
              { l: 'Venue', v: fixture.venue === 'H' ? 'Emirates Stadium' : fixture.venue === 'N' ? 'Principality Stadium, Cardiff' : 'Away' },
              { l: 'Kick-off', v: localiseMatchTime('15:00', tz) },
            ].map((i) => (
              <div key={i.l} style={{ marginRight: 16 }}>
                <div style={{ ...fixL, marginBottom: 2 }}>{i.l}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--cream-muted)', whiteSpace: 'nowrap' }}>{i.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* H2H Record */}
      {h2h ? (
        <>
          <Divide label="Head to Head" accent="var(--gold)" />
          <div style={{ padding: '0 16px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              {/* Record numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 40, fontWeight: 800, color: '#EF0107', lineHeight: 1 }}>{h2h.record.w}</div>
                  <div style={{ ...fixL, marginTop: 2 }}>Arsenal Wins</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 8px' }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 40, fontWeight: 800, color: 'var(--cream-dim)', lineHeight: 1 }}>{h2h.record.d}</div>
                  <div style={{ ...fixL, marginTop: 2 }}>Draws</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 40, fontWeight: 800, color: 'var(--cream-muted)', lineHeight: 1 }}>{h2h.record.l}</div>
                  <div style={{ ...fixL, marginTop: 2 }}>{fixture.opponent} Wins</div>
                </div>
              </div>
              {/* Win bar */}
              <div style={{ height: 4, background: 'var(--raised)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${wPct}%`, background: '#EF0107', borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          </div>

          {/* Recent meetings */}
          <Divide label="Last 5 Meetings" />
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {h2h.recent.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 5, background: RES_COLOR[m.r], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 800, color: 'rgba(0,0,0,0.7)' }}>{m.r}</span>
                </div>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 800, color: 'var(--cream)', width: 36, flexShrink: 0, whiteSpace: 'nowrap' }}>{m.score}</span>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--cream-muted)', flex: 1 }}>
                  {m.home ? 'Arsenal (H)' : fixture.opponent + ' (A)'}
                </span>
                <span style={{ ...fixL, whiteSpace: 'nowrap' }}>{m.date}</span>
              </div>
            ))}
          </div>

          {/* Oracle insight */}
          <Divide label="Oracle Insight" accent="var(--gold)" />
          <div style={{ padding: '0 16px' }}>
            <div style={{ background: '#FFFDF7', border: '1px solid rgba(184,150,62,0.2)', borderLeft: '3px solid var(--gold)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.65, color: 'var(--cream)' }}>{`"${h2h.insight}"`}</p>
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <p style={{ ...fixL, color: 'var(--cream-dim)' }}>H2H data coming soon</p>
        </div>
      )}
    </div>
  );
};

const Heatmap = () => {
  const maxH = 56;
  return (
    <div style={{ margin: '12px 16px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ ...fixL, color: 'var(--gold)' }}>Season Difficulty</span>
        <span style={{ ...fixL, whiteSpace: 'nowrap' }}>Title Defence</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: maxH + 16 }}>
        {MONTH_DATA.map((m) => {
          const h = Math.round(m.score * maxH);
          const col = m.score > 0.8 ? '#EF0107' : m.score > 0.6 ? 'var(--gold)' : '#4ADE80';
          return (
            <div key={m.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: '100%', height: h, borderRadius: '4px 4px 0 0', background: col, opacity: 0.8 }} />
              <span style={{ ...fixL }}>{m.m}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(239,1,7,0.05)', border: '1px solid rgba(239,1,7,0.1)', borderRadius: 8 }}>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.5, color: 'var(--cream-muted)' }}>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: '#EF0107' }}>September —</span> 4 top-6 clashes in 28 days. City away,
          Spurs at home, Liverpool away, PSG at home.
        </p>
      </div>
    </div>
  );
};

const FixtureRow = ({ fixture, onH2H }: { fixture: Fixture; onH2H: (f: Fixture) => void }) => {
  const [open, setOpen] = useState(false);
  const tz = useTZ();
  const d = DIFF[fixture.diff];
  const comp = COMP_SHORT[fixture.comp] || fixture.comp;
  const hasH2H = !!H2H_DATA[fixture.opponent];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${d.bar}`, borderRadius: 10, overflow: 'hidden' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ width: 44, flexShrink: 0 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 800, color: 'var(--cream)', lineHeight: 1.1 }}>
            {fixture.date.split(' ')[0]}
          </div>
          <div style={{ ...fixL, marginTop: 1 }}>{fixture.date.split(' ')[1]}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--cream)', lineHeight: 1.2 }}>{fixture.opponent}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <span style={{ ...fixL, whiteSpace: 'nowrap' }}>{comp}</span>
            <span
              style={{
                ...fixL,
                fontSize: 9,
                background: fixture.venue === 'H' ? 'rgba(239,1,7,0.1)' : 'var(--raised)',
                border: `1px solid ${fixture.venue === 'H' ? 'rgba(239,1,7,0.25)' : 'var(--border)'}`,
                borderRadius: 4,
                padding: '1px 5px',
                color: fixture.venue === 'H' ? '#EF0107' : 'var(--cream-dim)',
              }}
            >
              {fixture.venue}
            </span>
          </div>
        </div>
        <div style={{ background: d.badge, borderRadius: 6, padding: '4px 8px', flexShrink: 0, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: d.text, whiteSpace: 'nowrap' }}>
          {d.label}
        </div>
      </div>

      {open && (
        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {[
            { l: 'Kick-off', v: localiseMatchTime('15:00', tz) },
            { l: 'Ground', v: fixture.venue === 'H' ? 'Emirates' : fixture.venue === 'N' ? 'Principality Cardiff' : 'Away' },
            { l: 'TV', v: fixture.comp === 'Premier League' ? 'Sky Sports' : 'TNT Sports' },
          ].map((i) => (
            <div key={i.l}>
              <div style={{ ...fixL, marginBottom: 2 }}>{i.l}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--cream-muted)', whiteSpace: 'nowrap' }}>{i.v}</div>
            </div>
          ))}
          {hasH2H && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onH2H(fixture);
              }}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,1,7,0.08)', border: '1px solid rgba(239,1,7,0.2)', borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#EF0107', whiteSpace: 'nowrap' }}>
                H2H →
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const FixturesScreen = () => {
  const [activeMonth, setActiveMonth] = useState('All');
  const [h2hFixture, setH2hFixture] = useState<Fixture | null>(null);

  if (h2hFixture) {
    return <H2HView fixture={h2hFixture} onBack={() => setH2hFixture(null)} />;
  }

  const filtered = activeMonth === 'All' ? FIXTURES : FIXTURES.filter((f) => f.date.includes(activeMonth));
  const tzRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <TimezonePicker />
      <span
        style={{
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'var(--gold)',
          background: 'rgba(184,150,62,0.1)',
          border: '1px solid rgba(184,150,62,0.22)',
          borderRadius: 12,
          padding: '2px 8px',
        }}
      >
        2026/27
      </span>
    </div>
  );

  return (
    <div className="screen-enter">
      <ScreenHeader title="FIXTURES" right={tzRight} />
      <Heatmap />
      <div style={{ padding: '10px 0 6px' }}>
        <div className="tab-strip">
          {MONTHS.map((m) => (
            <button key={m} className={`tab-pill${activeMonth === m ? ' active' : ''}`} onClick={() => setActiveMonth(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((f) => (
          <FixtureRow key={f.id} fixture={f} onH2H={setH2hFixture} />
        ))}
      </div>
    </div>
  );
};
