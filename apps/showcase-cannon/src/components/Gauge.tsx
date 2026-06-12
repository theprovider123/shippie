/**
 * The Gauge — the post-match temperature of the fanbase. The dial SVG is the
 * design; never a charting library. Renders honest empty states: no average
 * is ever fabricated.
 */
import { useEffect, useRef, useState } from 'react';
import { GAUGE_EMPTY, fetchGauge, postGauge } from '../lib/api';
import { broadcastFanReaction } from '../lib/intents';
import type { GaugeSummary, Mood } from '../lib/types';
import { Rule } from './chrome';
import { ShareButton } from './ShareButton';
import { matchLink } from '../lib/share';

const MOODS: Array<{ id: Mood; label: string }> = [
  { id: 'buzzing', label: 'Buzzing' },
  { id: 'relieved', label: 'Relieved' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'frustrated', label: 'Frustrated' },
];

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
    <div className="gauge-dial">
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
        <path d={arcPath(rInner + 14, 0, 180)} fill="none" stroke="#EDE8E2" strokeWidth="26" strokeLinecap="round" />
        <path d={arcPath(rInner + 14, 0, 180)} fill="none" stroke="url(#arcGrad2)" strokeWidth="22" strokeLinecap="butt" opacity="0.85" />
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
        <text x={cx - (rInner + 16)} y={cy + 6} className="gauge-axis" textAnchor="middle">0</text>
        <text x={cx + (rInner + 16)} y={cy + 6} className="gauge-axis" textAnchor="middle">10</text>
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.7s cubic-bezier(0.34,1.2,0.64,1)' }}>
          <line x1={cx} y1={cy + 12} x2={cx} y2={cy - (rInner + 4)} stroke="var(--gold-light)" strokeWidth="3" strokeLinecap="round" filter="url(#glowNeedle2)" />
          <line x1={cx} y1={cy + 12} x2={cx} y2={cy + 20} stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
        </g>
        <circle cx={cx} cy={cy} r="9" fill="var(--raised)" stroke="var(--gold)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="4" fill="var(--gold)" />
      </svg>
      <div className="gauge-score">
        <div className="gauge-score-num">
          {score.toFixed(1)}
          <span className="gauge-score-of">/10</span>
        </div>
        <div className="gauge-verdict">{verdict}</div>
      </div>
    </div>
  );
};

/**
 * Full gauge panel for one match: community dial + my rating + mood + moment.
 */
export const GaugePanel = ({ matchId, matchLabel }: { matchId: string; matchLabel: string }) => {
  const [gauge, setGauge] = useState<GaugeSummary>(GAUGE_EMPTY);
  const [moment, setMoment] = useState('');
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    fetchGauge(matchId).then(({ gauge }) => {
      if (live.current) {
        setGauge(gauge);
        if (gauge.mine?.moment) setMoment(gauge.mine.moment);
      }
    });
    return () => {
      live.current = false;
    };
  }, [matchId]);

  const myRating = gauge.mine?.rating ?? 0;
  const myMood = gauge.mine?.mood ?? null;

  const patch = (p: { rating?: number | null; mood?: Mood | null; moment?: string | null }) => {
    setGauge((prev) => ({
      ...prev,
      mine: {
        rating: p.rating !== undefined ? p.rating : (prev.mine?.rating ?? null),
        mood: p.mood !== undefined ? p.mood : (prev.mine?.mood ?? null),
        moment: p.moment !== undefined ? p.moment : (prev.mine?.moment ?? null),
      },
    }));
    postGauge(matchId, p).then((res) => {
      if (res && live.current) setGauge(res);
    });
    broadcastFanReaction(matchId, 'gauge');
  };

  return (
    <section className="gauge-panel">
      {gauge.avg !== null ? (
        <>
          <GaugeDial score={gauge.avg} />
          <p className="gauge-count">
            {gauge.count.toLocaleString()} Gunner{gauge.count === 1 ? '' : 's'} rated
          </p>
        </>
      ) : (
        <div className="gauge-empty">
          <GaugeDial score={5} />
          <p className="gauge-count">No ratings yet — set the needle</p>
        </div>
      )}

      <div className="mood-grid">
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={`mood-cell${myMood === m.id ? ' active' : ''}`}
            onClick={() => patch({ mood: myMood === m.id ? null : m.id })}
          >
            <span className="mood-pct">{gauge.moods[m.id] ?? 0}%</span>
            <span className="mood-label">{m.label}</span>
          </button>
        ))}
      </div>

      <Rule label="Your rating" />
      <div className="rating-row">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            className={`rating-cell${myRating === n ? ' active' : ''}${myRating > 0 && n <= myRating ? ' lit' : ''}`}
            onClick={() => patch({ rating: myRating === n ? null : n })}
          >
            {n}
          </button>
        ))}
      </div>

      <input
        className="moment-input"
        value={moment}
        maxLength={140}
        onChange={(e) => setMoment(e.target.value)}
        onBlur={() => patch({ moment: moment.trim() || null })}
        onKeyDown={(e) => e.key === 'Enter' && patch({ moment: moment.trim() || null })}
        placeholder="Moment of the match…"
      />

      {(gauge.avg !== null || myRating > 0) && (
        <div className="gauge-share">
          <ShareButton
            ghost
            label="Share the gauge"
            moment={{
              title: 'The Cannon — fan gauge',
              text:
                gauge.avg !== null
                  ? `Gunners rated ${matchLabel} ${gauge.avg.toFixed(1)}/10${myRating ? ` — I gave it ${myRating}` : ''}.`
                  : `I rated ${matchLabel} ${myRating}/10 on The Cannon.`,
              url: matchLink(matchId),
            }}
          />
        </div>
      )}
    </section>
  );
};
