/**
 * Now — the answer to "what's happening with Arsenal right now?"
 *
 * One hero surface driven by the match-live feed's phase machine:
 *   pre   → scoreboard countdown, crowd prediction, calendar reminder
 *   live  → scoreline, minute, events timeline
 *   ht    → same, paused
 *   ft    → result + the Gauge
 *   idle  → next match countdown, last result, news digest, this-day
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyNote, PHASE_LABEL, Rule, ScoreLine, StaleBadge } from '../components/chrome';
import { GaugePanel } from '../components/Gauge';
import { ShareButton } from '../components/ShareButton';
import { fallbackPrediction, fetchPrediction, postPrediction } from '../lib/api';
import { FEEDS, useFeed } from '../lib/feeds';
import { downloadICS } from '../lib/ics';
import { broadcastFanReaction, broadcastMatchStarting, broadcastScoreUpdated } from '../lib/intents';
import { countdownTo, kickoffLabel, thisDayKey } from '../lib/matchday';
import { matchLink } from '../lib/share';
import type {
  Fixture,
  MatchEvent,
  MatchFeed,
  PredictionPick,
  PredictionSummary,
} from '../lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

// ── Countdown ────────────────────────────────────────────────────────────────
const CountdownBlock = ({ kickoffUtc }: { kickoffUtc: string }) => {
  const [now, setNow] = useState(() => Date.now());
  const cd = countdownTo(kickoffUtc, now);

  useEffect(() => {
    // Tick every second inside 24h (the scoreboard moment), per minute beyond.
    const fast = cd.totalMs < 86_400_000;
    const id = setInterval(() => setNow(Date.now()), fast ? 1000 : 60_000);
    return () => clearInterval(id);
  }, [cd.totalMs < 86_400_000]);

  if (cd.totalMs <= 0) {
    return <div className="countdown countdown--zero">Kick-off</div>;
  }
  if (cd.days > 0) {
    return (
      <div className="countdown">
        <span className="countdown-cell">
          <strong>{cd.days}</strong>
          <em>day{cd.days === 1 ? '' : 's'}</em>
        </span>
        <span className="countdown-cell">
          <strong>{pad(cd.hours)}</strong>
          <em>hrs</em>
        </span>
        <span className="countdown-cell">
          <strong>{pad(cd.minutes)}</strong>
          <em>min</em>
        </span>
      </div>
    );
  }
  return (
    <div className="countdown countdown--close">
      <span className="countdown-cell">
        <strong>{pad(cd.hours)}</strong>
        <em>hrs</em>
      </span>
      <span className="countdown-cell">
        <strong>{pad(cd.minutes)}</strong>
        <em>min</em>
      </span>
      <span className="countdown-cell">
        <strong>{pad(cd.seconds)}</strong>
        <em>sec</em>
      </span>
    </div>
  );
};

// ── Crowd prediction ─────────────────────────────────────────────────────────
const PICK_LABEL: Record<PredictionPick, string> = { W: 'Win', D: 'Draw', L: 'Loss' };

const PredictionStrip = ({ matchId, opponent }: { matchId: string; opponent: string }) => {
  const [summary, setSummary] = useState<PredictionSummary>(fallbackPrediction);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    fetchPrediction(matchId).then(({ prediction }) => {
      if (live.current) setSummary(prediction);
    });
    return () => {
      live.current = false;
    };
  }, [matchId]);

  const pick = (p: PredictionPick) => {
    const next = summary.mine === p ? null : p;
    // Optimistic local re-count.
    setSummary((prev) => {
      const counts = { ...prev.counts };
      if (prev.mine) counts[prev.mine] = Math.max(0, counts[prev.mine] - 1);
      if (next) counts[next] += 1;
      const total = counts.W + counts.D + counts.L;
      return {
        counts,
        total,
        confidence: total > 0 ? Math.round((counts.W / total) * 100) : null,
        mine: next,
      };
    });
    postPrediction(matchId, next).then((res) => {
      if (res && live.current) setSummary(res);
    });
    broadcastFanReaction(matchId, 'prediction');
  };

  return (
    <div className="predict">
      <div className="predict-row">
        {(['W', 'D', 'L'] as PredictionPick[]).map((p) => (
          <button
            key={p}
            className={`predict-btn${summary.mine === p ? ' active' : ''}`}
            onClick={() => pick(p)}
          >
            {PICK_LABEL[p]}
            {summary.total > 0 && (
              <span className="predict-pct">
                {Math.round((summary.counts[p] / summary.total) * 100)}%
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="predict-meta">
        {summary.confidence !== null ? (
          <>
            <div className="predict-bar">
              <div className="predict-bar-fill" style={{ width: `${summary.confidence}%` }} />
            </div>
            <span className="predict-caption">
              {summary.confidence}% of {summary.total.toLocaleString()} Gunner{summary.total === 1 ? '' : 's'} call a win
            </span>
          </>
        ) : (
          <span className="predict-caption">No calls yet — be the first</span>
        )}
      </div>
      {summary.mine && (
        <ShareButton
          ghost
          label="Share my call"
          moment={{
            title: 'The Cannon — my call',
            text: `I'm calling Arsenal ${PICK_LABEL[summary.mine].toLowerCase()} against ${opponent}${
              summary.confidence !== null ? ` — ${summary.confidence}% of Gunners agree it's a win` : ''
            }.`,
            url: matchLink(matchId),
          }}
        />
      )}
    </div>
  );
};

// ── Events timeline ──────────────────────────────────────────────────────────
const EVENT_GLYPH: Record<MatchEvent['type'], string> = {
  goal: '●',
  'own-goal': '◐',
  pen: '◉',
  red: '▮',
  yellow: '▯',
  sub: '⇄',
  var: 'VAR',
  note: '·',
};

const EventsTimeline = ({ events }: { events: MatchEvent[] }) => {
  if (events.length === 0) return <EmptyNote>No events yet. Hold tight.</EmptyNote>;
  return (
    <ol className="events">
      {[...events]
        .sort((a, b) => b.min - a.min)
        .map((e, i) => (
          <li key={i} className={`event${e.ours ? ' event--ours' : ''}`}>
            <span className="event-min">{e.min}&prime;</span>
            <span className={`event-glyph event-glyph--${e.type}`}>{EVENT_GLYPH[e.type]}</span>
            <span className="event-body">
              {e.player ?? e.detail ?? e.type}
              {e.player && e.detail ? <em> — {e.detail}</em> : null}
            </span>
          </li>
        ))}
    </ol>
  );
};

// ── The screen ───────────────────────────────────────────────────────────────
export const NowScreen = ({
  onOpenMatch,
  onOpenTerrace,
}: {
  onOpenMatch: (matchId: string) => void;
  onOpenTerrace: () => void;
}) => {
  const isLivePhase = (m: MatchFeed) => m.phase === 'live' || m.phase === 'ht';
  // Poll cadence follows the phase: eager when live, gentle on matchday, lazy otherwise.
  const [pollMs, setPollMs] = useState<number>(0);
  const match = useFeed(FEEDS.match, pollMs);
  const news = useFeed(FEEDS.news);
  const club = useFeed(FEEDS.club);
  const m = match.data;

  useEffect(() => {
    const next = isLivePhase(m) ? 45_000 : m.phase === 'pre' ? 180_000 : 0;
    setPollMs(next);
  }, [m.phase]);

  // Cross-app intents: announce kickoff and score changes.
  const prevScore = useRef<string | null>(null);
  const announcedLive = useRef<string | null>(null);
  useEffect(() => {
    if (isLivePhase(m) && announcedLive.current !== m.matchId) {
      announcedLive.current = m.matchId;
      broadcastMatchStarting(m.matchId, m.opponent, m.kickoffUtc);
    }
    if (m.score) {
      const key = `${m.matchId}:${m.score.home}-${m.score.away}`;
      if (prevScore.current && prevScore.current !== key) {
        broadcastScoreUpdated(m.matchId, m.score.home, m.score.away, m.minute);
      }
      prevScore.current = key;
    }
  }, [m.matchId, m.score?.home, m.score?.away, m.phase]);

  const thisDay = useMemo(() => club.data.thisDay?.[thisDayKey()] ?? null, [club.data]);
  const newsItems = news.data.items.slice(0, 3);

  const heroFixture: Fixture = {
    id: m.matchId,
    kickoffUtc: m.kickoffUtc,
    comp: m.comp ?? '',
    opponent: m.opponent,
    opponentShort: m.opponentShort ?? m.opponent.slice(0, 3).toUpperCase(),
    venue: (m.venue as Fixture['venue']) ?? 'H',
    ground: m.ground,
    status: 'scheduled',
  };

  const venueLabel =
    m.venue === 'H' ? 'Home · Emirates Stadium' : m.venue === 'A' ? 'Away' : m.ground ?? 'Neutral venue';

  return (
    <div className="screen now-screen">
      {/* ── HERO ── */}
      <section className={`hero hero--${m.phase}`}>
        <div className="hero-top">
          <span className="hero-phase">{PHASE_LABEL[m.phase]}</span>
          <StaleBadge stale={match.stale} asOf={match.asOf} />
        </div>

        <div className="hero-tie">
          <span className="hero-team hero-team--ars">Arsenal</span>
          <span className="hero-vs">{m.venue === 'A' ? '@' : 'v'}</span>
          <span className="hero-team">{m.opponent}</span>
        </div>
        <div className="hero-meta">
          {m.comp && <span>{m.comp}</span>}
          <span>{kickoffLabel(m.kickoffUtc)}</span>
          <span>{venueLabel}</span>
        </div>

        {(m.phase === 'pre' || m.phase === 'idle') && (
          <>
            <CountdownBlock kickoffUtc={m.kickoffUtc} />
            <div className="hero-actions">
              <ShareButton
                moment={{
                  title: 'The Cannon — next match',
                  text: `Arsenal ${m.venue === 'A' ? 'away at' : 'vs'} ${m.opponent} — ${kickoffLabel(m.kickoffUtc)}. Counting down on The Cannon.`,
                  url: matchLink(m.matchId),
                }}
                label="Share match"
              />
              <button className="ghost-btn" onClick={() => downloadICS(heroFixture)}>
                Add to calendar
              </button>
            </div>
          </>
        )}

        {isLivePhase(m) && (
          <>
            {m.score ? (
              <ScoreLine
                home={m.score.home}
                away={m.score.away}
                opponentShort={m.opponentShort ?? 'OPP'}
                venue={m.venue}
              />
            ) : (
              <div className="score-unknown">
                <span className="score-unknown-label">Match in progress</span>
                <span className="score-unknown-sub">
                  {match.online ? 'Live score arriving…' : 'Live score unavailable offline'}
                </span>
              </div>
            )}
            <div className="hero-minute">
              {m.phase === 'ht' ? 'HT' : m.minute !== null ? `${m.minute}′` : ''}
            </div>
            <div className="hero-actions">
              {m.score && (
                <ShareButton
                  moment={{
                    title: 'The Cannon — live',
                    text: `LIVE: Arsenal ${m.score.home}–${m.score.away} ${m.opponent}${m.minute ? ` (${m.minute}′)` : ''}.`,
                    url: matchLink(m.matchId),
                  }}
                  label="Share score"
                />
              )}
              <button className="ghost-btn" onClick={onOpenTerrace}>
                Join the Terrace
              </button>
            </div>
          </>
        )}

        {m.phase === 'ft' && m.score && (
          <ScoreLine
            home={m.score.home}
            away={m.score.away}
            opponentShort={m.opponentShort ?? 'OPP'}
            venue={m.venue}
          />
        )}
      </section>

      {/* ── Pre-match: the crowd call ── */}
      {(m.phase === 'pre' || m.phase === 'idle') && (
        <>
          <Rule label="Your call" accent="#EF0107" />
          <PredictionStrip matchId={m.matchId} opponent={m.opponent} />
        </>
      )}

      {/* ── Oracle preview ── */}
      {m.preview && (m.phase === 'pre' || m.phase === 'idle') && (
        <>
          <Rule label="The brief" accent="var(--gold)" />
          <blockquote className="oracle">
            <p>“{m.preview.quote}”</p>
            <footer>
              <span>
                Key battle — <strong>{m.preview.keyBattle}</strong>
              </span>
            </footer>
          </blockquote>
        </>
      )}

      {/* ── Live: events ── */}
      {isLivePhase(m) && (
        <>
          <Rule label="Events" accent="#EF0107" />
          <EventsTimeline events={m.events} />
        </>
      )}

      {/* ── Full-time: the Gauge ── */}
      {m.phase === 'ft' && (
        <>
          <Rule label="The gauge" accent="#EF0107" />
          <GaugePanel
            matchId={m.matchId}
            matchLabel={
              m.score ? `Arsenal ${m.score.home}–${m.score.away} ${m.opponent}` : `Arsenal v ${m.opponent}`
            }
          />
        </>
      )}

      {/* ── Idle: last result strip ── */}
      {m.phase === 'idle' && m.lastResult && (
        <>
          <Rule label="Last time out" />
          <button className="last-result" onClick={() => onOpenMatch(m.lastResult!.matchId)}>
            <span className="last-result-score">
              {m.lastResult.score
                ? `${m.lastResult.score.home}–${m.lastResult.score.away}`
                : '—'}
            </span>
            <span className="last-result-body">
              <strong>{m.lastResult.label}</strong>
              {m.lastResult.postMatch && <em>{m.lastResult.postMatch}</em>}
            </span>
            <span className="last-result-arrow">→</span>
          </button>
        </>
      )}

      {/* ── News digest ── */}
      {(m.phase === 'idle' || m.phase === 'pre') && newsItems.length > 0 && (
        <>
          <Rule label="Around the club" right={<StaleBadge stale={news.stale} asOf={news.asOf} />} />
          <ul className="news-list">
            {newsItems.map((n) => (
              <li key={n.id} className="news-item">
                <a href={n.url} target="_blank" rel="noreferrer">
                  <span className="news-title">{n.title}</span>
                  <span className="news-summary">{n.summary}</span>
                  <span className="news-source">
                    {n.source} ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── This day ── */}
      {m.phase === 'idle' && thisDay && (
        <>
          <Rule label="This day in Arsenal" accent="var(--gold)" />
          <div className="this-day">
            <span className="this-day-year">{thisDay.year}</span>
            <p>{thisDay.text}</p>
          </div>
        </>
      )}
    </div>
  );
};
