// GaugeScreen — ported from cannon-gauge.jsx, wired to /api/cannon/gauge.
// The dial SVG is the design; never a charting library.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ScreenHeader } from '../components/chrome';
import { fallbackGauge, fetchGauge, postGauge } from '../lib/api';
import type { GaugeSummary, Mood } from '../lib/types';
import { CURRENT_MATCH, MOODS, ORACLE } from '../data/match';

const gauL: CSSProperties = {
  fontFamily: "'Barlow Condensed',sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--cream-dim)',
};
const gauB: CSSProperties = {
  fontFamily: "'Inter',sans-serif",
  fontSize: 14,
  lineHeight: 1.65,
  fontWeight: 400,
  color: 'var(--cream-muted)',
};

export const GaugeDial = ({ score }: { score: number }) => {
  const cx = 150;
  const cy = 148;
  const rInner = 88;
  const rotation = (score / 5 - 1) * 90;

  const arcPath = (radius: number, startDeg: number, endDeg: number) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(s);
    const y1 = cy - radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e);
    const y2 = cy - radius * Math.sin(e);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${endDeg - startDeg > 180 ? 1 : 0} 0 ${x2} ${y2}`;
  };

  const verdict =
    score >= 8.5 ? 'Euphoric Gunners' :
    score >= 7 ? 'Optimistic Gunners' :
    score >= 5 ? 'Cautious Gunners' :
    score >= 3 ? 'Worried Gunners' : 'Dark Days';

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox="0 0 300 165" style={{ width: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="arcGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3a2020" />
            <stop offset="40%" stopColor="#7a3010" />
            <stop offset="70%" stopColor="#EF0107" />
            <stop offset="100%" stopColor="#B8963E" />
          </linearGradient>
          <filter id="glowNeedle2">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <path d={arcPath(rInner + 14, 0, 180)} fill="none" stroke="#EDE8E2" strokeWidth="26" strokeLinecap="round" />
        {/* Coloured arc */}
        <path d={arcPath(rInner + 14, 0, 180)} fill="none" stroke="url(#arcGrad2)" strokeWidth="22" strokeLinecap="butt" opacity="0.85" />
        {/* Tick marks */}
        {[0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 180].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={cx + (rInner + 3) * Math.cos(rad)}
              y1={cy - (rInner + 3) * Math.sin(rad)}
              x2={cx + (rInner + 25) * Math.cos(rad)}
              y2={cy - (rInner + 25) * Math.sin(rad)}
              stroke="#F8F4EE"
              strokeWidth={i % 2 === 0 ? 2 : 1}
              opacity="0.8"
            />
          );
        })}
        {/* Score labels */}
        <text x={cx - (rInner + 16)} y={cy + 6} fontFamily="'Barlow Condensed',sans-serif" fontSize="11" fill="var(--cream-dim)" textAnchor="middle" fontWeight="600">
          0
        </text>
        <text x={cx + (rInner + 16)} y={cy + 6} fontFamily="'Barlow Condensed',sans-serif" fontSize="11" fill="var(--cream-dim)" textAnchor="middle" fontWeight="600">
          10
        </text>
        {/* Needle */}
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.7s cubic-bezier(0.34,1.2,0.64,1)' }}>
          <line x1={cx} y1={cy + 12} x2={cx} y2={cy - (rInner + 4)} stroke="var(--gold-light)" strokeWidth="3" strokeLinecap="round" filter="url(#glowNeedle2)" />
          <line x1={cx} y1={cy + 12} x2={cx} y2={cy + 20} stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
        </g>
        {/* Hub */}
        <circle cx={cx} cy={cy} r="9" fill="var(--raised)" stroke="var(--gold)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="4" fill="var(--gold)" />
      </svg>
      {/* Score */}
      <div style={{ textAlign: 'center', marginTop: -10 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 64, fontWeight: 800, lineHeight: 1, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
          {score.toFixed(1)}
          <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--cream-dim)' }}>/10</span>
        </div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, color: '#EF0107', marginTop: 4 }}>{verdict}</div>
      </div>
    </div>
  );
};

export const GaugeScreen = () => {
  const [gauge, setGauge] = useState<GaugeSummary>(fallbackGauge);
  const [moment, setMoment] = useState('');
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    fetchGauge(CURRENT_MATCH.id).then(({ gauge }) => {
      if (live.current) {
        setGauge(gauge);
        if (gauge.mine?.moment) setMoment(gauge.mine.moment);
      }
    });
    return () => {
      live.current = false;
    };
  }, []);

  const myRating = gauge.mine?.rating ?? 0;
  const myMood = gauge.mine?.mood ?? null;
  const aggregate = gauge.avg ?? 7.4;

  const patch = (p: { rating?: number | null; mood?: Mood | null; moment?: string | null }) => {
    // Optimistic local merge; the server response is the tie-breaker.
    setGauge((prev) => ({
      ...prev,
      mine: {
        rating: p.rating !== undefined ? p.rating : (prev.mine?.rating ?? null),
        mood: p.mood !== undefined ? p.mood : (prev.mine?.mood ?? null),
        moment: p.moment !== undefined ? p.moment : (prev.mine?.moment ?? null),
      },
    }));
    postGauge(CURRENT_MATCH.id, p).then((res) => {
      if (res && live.current) setGauge(res);
    });
  };

  const handleRating = (n: number) => patch({ rating: myRating === n ? null : n });
  const handleMood = (m: Mood) => patch({ mood: myMood === m ? null : m });

  const matchRight = (
    <span
      style={{
        fontFamily: "'Barlow Condensed',sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'var(--cream-dim)',
        background: 'var(--raised)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '3px 10px',
      }}
    >
      {CURRENT_MATCH.label}
    </span>
  );

  return (
    <div className="screen-enter">
      <ScreenHeader title="GAUGE" right={matchRight} />

      {/* Oracle verdict */}
      <div style={{ margin: '14px 16px 0', background: '#FFFDF7', border: '1px solid rgba(184,150,62,0.22)', borderLeft: '3px solid var(--gold)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ ...gauL, color: 'var(--gold)', marginBottom: 8 }}>Oracle Post-Match</div>
        <p style={{ ...gauB, fontStyle: 'italic' }}>{ORACLE.postMatch}</p>
      </div>

      {/* Gauge dial */}
      <div style={{ padding: '14px 10px 0' }}>
        <GaugeDial score={aggregate} />
      </div>

      {/* Fan count */}
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{ ...gauL }}>{gauge.count.toLocaleString()} Gunners rated</span>
      </div>

      {/* Mood grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 16px 0' }}>
        {MOODS.map((m) => (
          <button
            key={m.id}
            onClick={() => handleMood(m.id)}
            style={{
              background: myMood === m.id ? 'rgba(239,1,7,0.08)' : 'var(--surface)',
              border: `1px solid ${myMood === m.id ? 'rgba(239,1,7,0.25)' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '12px 14px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 800, color: 'var(--cream)', lineHeight: 1 }}>
              {gauge.moods[m.id] ?? 0}%
            </div>
            <div style={{ ...gauL, marginTop: 4 }}>{m.label}</div>
          </button>
        ))}
      </div>

      {/* Your rating */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ ...gauL, marginBottom: 8 }}>Your Rating</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              onClick={() => handleRating(n)}
              style={{
                flex: 1,
                height: 38,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                background: myRating === n ? '#EF0107' : 'var(--raised)',
                color: myRating === n ? '#fff' : 'var(--cream-muted)',
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 14,
                fontWeight: 700,
                transition: 'all 0.15s',
                outline: myRating > 0 && n <= myRating ? '1px solid rgba(239,1,7,0.25)' : 'none',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Moment of match */}
      <div style={{ padding: '12px 16px 20px' }}>
        <input
          value={moment}
          maxLength={140}
          onChange={(e) => setMoment(e.target.value)}
          onBlur={() => patch({ moment: moment.trim() || null })}
          onKeyDown={(e) => e.key === 'Enter' && patch({ moment: moment.trim() || null })}
          placeholder="Moment of the match…"
          style={{
            width: '100%',
            background: 'var(--raised)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            fontFamily: "'Inter',sans-serif",
            fontSize: 14,
            color: 'var(--cream)',
            caretColor: '#EF0107',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
};
