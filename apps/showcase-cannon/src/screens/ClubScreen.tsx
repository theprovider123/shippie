// The Club — ported from cannon-archive.jsx. Squad grid · Season stats ·
// History · Player drill-down with ghost shirt numbers.
import { useState, type CSSProperties } from 'react';
import { Divide, ScreenHeader } from '../components/chrome';
import { KEY_METRICS, LAST_10, RECENT, SCORERS, SEASON_ROW, TROPHIES } from '../data/club';
import { SQUAD_GROUPS } from '../data/squad';
import type { Player } from '../lib/types';

const cL: CSSProperties = {
  fontFamily: "'Barlow Condensed',sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--cream-dim)',
};
const cB: CSSProperties = {
  fontFamily: "'Inter',sans-serif",
  fontSize: 14,
  lineHeight: 1.6,
  fontWeight: 400,
  color: 'var(--cream-muted)',
};
const RC: Record<'W' | 'D' | 'L', string> = { W: '#4ADE80', D: '#FCD34D', L: '#FF5555' };

// ── Player Mini Card (squad grid) ─────────────────────────────────────────────
const PlayerMini = ({ player, onClick }: { player: Player; onClick: (p: Player) => void }) => (
  <button
    onClick={() => onClick(player)}
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '12px 10px',
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}
  >
    {/* Ghost number */}
    <div style={{ position: 'absolute', top: -2, right: 4, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 56, fontWeight: 800, color: '#EF0107', opacity: 0.06, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>
      {player.num}
    </div>
    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 800, color: '#EF0107', lineHeight: 1, marginBottom: 4 }}>{player.num}</div>
    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--cream)', letterSpacing: '0.02em', marginBottom: 2 }}>
      {player.name}
    </div>
    <div style={{ ...cL, color: 'var(--cream-dim)' }}>
      {player.pos} · {player.nat}
    </div>
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
      {player.form.map((r, i) => (
        <div key={i} style={{ width: 14, height: 14, borderRadius: 2, background: RC[r], opacity: 0.8 }} />
      ))}
    </div>
  </button>
);

// ── Player Detail (drill-down) ────────────────────────────────────────────────
export const PlayerDetail = ({ player, onBack }: { player: Player; onBack: () => void }) => (
  <div className="screen-enter">
    {/* Back header */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
      <button onClick={onBack} aria-label="Back to squad" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-dim)" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        <span style={{ ...cL, color: 'var(--cream-dim)' }}>Squad</span>
      </button>
    </div>

    <div style={{ padding: '16px 16px 0', position: 'relative', overflow: 'hidden' }}>
      {/* Ghost number */}
      <div style={{ position: 'absolute', top: -8, right: -8, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 120, fontWeight: 800, color: '#EF0107', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>
        {player.num}
      </div>
      {/* Name + position */}
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{player.full}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ ...cL, color: 'var(--gold)' }}>{player.pos}</span>
        <span style={{ ...cL }}>{player.nat}</span>
        <span style={{ ...cL }}>#{player.num}</span>
      </div>
    </div>

    {/* Stats */}
    <div style={{ padding: '0 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        {[
          { l: 'Apps', v: player.apps },
          { l: 'Goals', v: player.goals },
          { l: 'Assists', v: player.assists },
          { l: 'Rating', v: player.rating },
        ].map((s) => (
          <div key={s.l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 800, color: 'var(--cream)', lineHeight: 1 }}>{s.v}</div>
            <div style={{ ...cL, marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Form */}
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ ...cL, marginBottom: 8 }}>Recent Form</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {player.form.map((r, i) => (
          <div key={i} style={{ width: 40, height: 40, borderRadius: 8, background: RC[r], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 800, color: 'rgba(0,0,0,0.7)' }}>{r}</span>
          </div>
        ))}
      </div>
    </div>

    {/* 25/26 Season note */}
    <div style={{ padding: '14px 16px 20px' }}>
      <div style={{ background: 'rgba(184,150,62,0.06)', border: '1px solid rgba(184,150,62,0.15)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ ...cL, color: 'var(--gold)', marginBottom: 4 }}>2025/26 Season</div>
        <p style={{ ...cB, fontSize: 13 }}>Premier League Champions. These stats are from the title-winning season.</p>
      </div>
    </div>
  </div>
);

// ── Season Stats ──────────────────────────────────────────────────────────────
const SeasonStats = () => {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [statType, setStatType] = useState<'goals' | 'assists'>('goals');

  return (
    <div>
      {/* Season card */}
      <div style={{ margin: '12px 16px 0', background: 'linear-gradient(150deg,#EF0107 0%,#C00005 100%)', borderRadius: 14, padding: 16, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, background: 'radial-gradient(circle,rgba(255,255,255,0.1) 0%,transparent 70%)' }} />
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
          Premier League · 2025/26 · Champions
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          {SEASON_ROW.map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: l === 'PTS' ? 28 : 22, fontWeight: 800, color: l === 'PTS' ? 'var(--gold-pale)' : '#fff', lineHeight: 1 }}>
                {v}
              </div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginRight: 6 }}>
            LAST 10
          </span>
          {LAST_10.map((r, i) => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: RC[r], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 8, fontWeight: 800, color: 'rgba(0,0,0,0.7)' }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Key metrics */}
      <Divide label="Key Metrics" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px' }}>
        {KEY_METRICS.map((m) => (
          <div key={m.l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 800, color: 'var(--cream)', lineHeight: 1 }}>{m.v}</div>
            <div style={{ ...cL, marginTop: 4 }}>{m.l}</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: 'var(--gold)', marginTop: 3 }}>{m.s}</div>
          </div>
        ))}
      </div>

      {/* Recent results */}
      <Divide label="Recent Results" />
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {RECENT.map((m, i) => (
          <div
            key={i}
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', borderLeft: `3px solid ${RC[m.r]}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: RC[m.r], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 800, color: 'rgba(0,0,0,0.7)' }}>{m.r}</span>
              </div>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 800, color: 'var(--cream)', width: 36, flexShrink: 0, whiteSpace: 'nowrap' }}>{m.score}</span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--cream-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.opp}
                </span>
                <span
                  style={{
                    ...cL,
                    fontSize: 9,
                    background: m.home ? 'rgba(239,1,7,0.1)' : 'var(--raised)',
                    border: `1px solid ${m.home ? 'rgba(239,1,7,0.25)' : 'var(--border)'}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    color: m.home ? '#EF0107' : 'var(--cream-dim)',
                    flexShrink: 0,
                  }}
                >
                  {m.home ? 'H' : 'A'}
                </span>
              </div>
              <span style={{ ...cL, whiteSpace: 'nowrap', flexShrink: 0 }}>{m.date}</span>
            </div>
            {expanded === i && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { l: 'xG', v: m.xg },
                  { l: 'Shots', v: String(m.shots) },
                  { l: 'Possession', v: `${m.poss}%` },
                ].map((s) => (
                  <div key={s.l}>
                    <div style={{ ...cL, marginBottom: 2 }}>{s.l}</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--cream-muted)' }}>{s.v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Top scorers */}
      <Divide label="Top Scorers" />
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6 }}>
        {(
          [
            { id: 'goals', l: 'Goals' },
            { id: 'assists', l: 'Assists' },
          ] as Array<{ id: 'goals' | 'assists'; l: string }>
        ).map((t) => (
          <button key={t.id} className={`tab-pill${statType === t.id ? ' active' : ''}`} onClick={() => setStatType(t.id)}>
            {t.l}
          </button>
        ))}
      </div>
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[...SCORERS[statType]]
          .sort((a, b) => b.v - a.v)
          .map((p, i, sorted) => (
            <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <span style={{ ...cL, width: 14, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--cream)', flex: 1 }}>{p.n}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ height: 3, width: Math.round((p.v / sorted[0].v) * 70), background: 'linear-gradient(90deg,#EF0107,#C4982A)', borderRadius: 2 }} />
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 800, color: 'var(--cream)', minWidth: 22, textAlign: 'right' }}>{p.v}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

// ── The Club Screen ───────────────────────────────────────────────────────────
export const ClubScreen = () => {
  const [tab, setTab] = useState<'squad' | 'season' | 'history'>('squad');
  const [selPlayer, setSelPlayer] = useState<Player | null>(null);

  // Drill-down: player detail
  if (selPlayer) {
    return <PlayerDetail player={selPlayer} onBack={() => setSelPlayer(null)} />;
  }

  const tabRight = (
    <div style={{ display: 'flex', gap: 5 }}>
      {(
        [
          { id: 'squad', l: 'Squad' },
          { id: 'season', l: 'Season' },
          { id: 'history', l: 'History' },
        ] as Array<{ id: 'squad' | 'season' | 'history'; l: string }>
      ).map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            fontFamily: "'Barlow Condensed',sans-serif",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 20,
            cursor: 'pointer',
            transition: 'all 0.15s',
            background: tab === t.id ? '#EF0107' : 'transparent',
            border: `1px solid ${tab === t.id ? '#EF0107' : 'var(--border-strong)'}`,
            color: tab === t.id ? '#fff' : 'var(--cream-dim)',
          }}
        >
          {t.l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="screen-enter">
      <ScreenHeader title="CLUB" right={tabRight} />

      {tab === 'squad' && (
        <div style={{ padding: '12px 16px 20px' }}>
          {SQUAD_GROUPS.map((g) => (
            <div key={g.group} style={{ marginBottom: 16 }}>
              <div style={{ ...cL, color: 'var(--gold)', marginBottom: 8 }}>{g.group}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {g.players.map((p) => (
                  <PlayerMini key={p.num} player={p} onClick={setSelPlayer} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'season' && <SeasonStats />}

      {tab === 'history' && (
        <div>
          <div style={{ margin: '14px 16px 0', background: 'linear-gradient(150deg,#EF0107 0%,#C00005 100%)', borderRadius: 16, padding: 18, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, background: 'radial-gradient(circle,rgba(255,255,255,0.1) 0%,transparent 70%)' }} />
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
              Champions · 2025/26
            </div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 26, fontWeight: 900, lineHeight: 1.2, color: '#fff', marginBottom: 12 }}>
              Twenty-two years.
              <br />
              The wait is over.
            </h2>
            <div style={{ display: 'flex', gap: 20 }}>
              {(
                [
                  ['91', 'Pts'],
                  ['89', 'Goals'],
                  ['18', 'Clean Sheets'],
                ] as Array<[string, string]>
              ).map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{v}</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '14px 16px 20px' }}>
            <div style={{ ...cL, marginBottom: 12 }}>Trophy Timeline</div>
            {TROPHIES.map((t, i) => (
              <div key={t.year} style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: t.gold ? 'var(--gold)' : 'var(--raised)', border: `2px solid ${t.gold ? 'var(--gold)' : 'var(--border-strong)'}` }} />
                  {i < TROPHIES.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 30, background: 'var(--border)' }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: 14 }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 800, color: t.gold ? 'var(--gold-light)' : 'var(--cream)', marginBottom: 2 }}>
                    {t.year} — {t.title}
                  </div>
                  <div style={{ ...cB, fontSize: 13 }}>{t.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
