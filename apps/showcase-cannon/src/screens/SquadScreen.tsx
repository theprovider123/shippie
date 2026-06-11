/**
 * Squad — the players as they are this week: availability, form, stats —
 * plus the Club section (title season, scorers, trophy timeline) folded in
 * as a sub-view rather than burning a whole tab on history.
 */
import { useState } from 'react';
import { EmptyNote, Rule, StaleBadge } from '../components/chrome';
import { ShareButton } from '../components/ShareButton';
import { FEEDS, useFeed } from '../lib/feeds';
import { playerLink } from '../lib/share';
import type { Availability, ClubFeed, Player, ResultLetter } from '../lib/types';

const RES_CLASS: Record<ResultLetter, string> = { W: 'res-w', D: 'res-d', L: 'res-l' };

const AVAIL: Record<Availability, { label: string; cls: string }> = {
  fit: { label: 'Fit', cls: 'avail--fit' },
  doubt: { label: 'Doubt', cls: 'avail--doubt' },
  injured: { label: 'Injured', cls: 'avail--injured' },
  suspended: { label: 'Suspended', cls: 'avail--suspended' },
};

// ── Player detail ────────────────────────────────────────────────────────────
const PlayerDetail = ({ player, onBack }: { player: Player; onBack: () => void }) => (
  <div className="screen detail-screen">
    <div className="detail-head">
      <button className="back-btn" onClick={onBack} aria-label="Back to squad">
        ← Squad
      </button>
      <ShareButton
        ghost
        label="Share"
        moment={{
          title: `The Cannon — ${player.full}`,
          text: `${player.full} (#${player.num}) — ${player.stats.goals} goals, ${player.stats.assists} assists, ${player.stats.rating} rating. ${player.note ?? ''}`.trim(),
          url: playerLink(player.id),
        }}
      />
    </div>

    <section className="player-hero">
      <span className="player-ghost-num" aria-hidden="true">
        {player.num}
      </span>
      <h2 className="player-name">{player.full}</h2>
      <div className="player-meta">
        <span className="player-pos">{player.pos}</span>
        <span>{player.nat}</span>
        <span>#{player.num}</span>
        <span className={`avail ${AVAIL[player.availability].cls}`}>{AVAIL[player.availability].label}</span>
      </div>
      {player.availabilityNote && <p className="player-avail-note">{player.availabilityNote}</p>}
    </section>

    <div className="stat-grid">
      {[
        { l: 'Apps', v: player.stats.apps },
        { l: 'Goals', v: player.stats.goals },
        { l: 'Assists', v: player.stats.assists },
        { l: 'Rating', v: player.stats.rating },
      ].map((s) => (
        <div key={s.l} className="stat-cell">
          <strong>{s.v}</strong>
          <em>{s.l}</em>
        </div>
      ))}
    </div>

    <Rule label="Recent form" />
    <div className="form-row">
      {player.form.map((r, i) => (
        <span key={i} className={`form-cell ${RES_CLASS[r]}`}>
          {r}
        </span>
      ))}
    </div>

    {player.note && (
      <>
        <Rule label="The book on him" accent="var(--gold)" />
        <blockquote className="oracle">
          <p>{player.note}</p>
        </blockquote>
      </>
    )}
  </div>
);

// ── Club sub-view ────────────────────────────────────────────────────────────
const ClubView = ({ club }: { club: ClubFeed }) => {
  const [stat, setStat] = useState<'goals' | 'assists'>('goals');
  const season = club.lastSeason;

  return (
    <div className="club-view">
      {season && (
        <>
          <section className="champions-card">
            <span className="champions-label">{season.label}</span>
            <h2 className="champions-headline">{season.headline}</h2>
            <div className="champions-stats">
              {season.headlineStats.map((s) => (
                <span key={s.l}>
                  <strong>{s.v}</strong>
                  <em>{s.l}</em>
                </span>
              ))}
            </div>
            <div className="champions-last10">
              <em>Last 10</em>
              {season.last10.map((r, i) => (
                <span key={i} className={`form-dot ${RES_CLASS[r]}`}>
                  {r}
                </span>
              ))}
            </div>
          </section>

          <Rule label="Key numbers" />
          <div className="stat-grid">
            {season.keyMetrics.map((m) => (
              <div key={m.l} className="stat-cell">
                <strong>{m.v}</strong>
                <em>{m.l}</em>
                <i>{m.s}</i>
              </div>
            ))}
          </div>

          <Rule
            label="Top scorers"
            right={
              <span className="rule-toggle">
                {(['goals', 'assists'] as const).map((s) => (
                  <button key={s} className={`chip chip--small${stat === s ? ' active' : ''}`} onClick={() => setStat(s)}>
                    {s === 'goals' ? 'Goals' : 'Assists'}
                  </button>
                ))}
              </span>
            }
          />
          <ul className="scorers">
            {[...season.scorers[stat]]
              .sort((a, b) => b.v - a.v)
              .map((p, i, sorted) => (
                <li key={p.n} className="scorer">
                  <span className="scorer-rank">{i + 1}</span>
                  <span className="scorer-name">{p.n}</span>
                  <span className="scorer-bar" style={{ width: `${Math.round((p.v / (sorted[0]?.v || 1)) * 64)}px` }} />
                  <span className="scorer-val">{p.v}</span>
                </li>
              ))}
          </ul>
        </>
      )}

      <Rule label="Trophy timeline" accent="var(--gold)" />
      <ol className="trophies">
        {club.trophies.map((t, i) => (
          <li key={`${t.year}-${i}`} className={`trophy${t.gold ? ' trophy--gold' : ''}`}>
            <span className="trophy-dot" />
            <div className="trophy-body">
              <strong>
                {t.year} — {t.title}
              </strong>
              <p>{t.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

// ── Screen ───────────────────────────────────────────────────────────────────
export const SquadScreen = ({
  openPlayerId,
  onOpenPlayer,
  onClosePlayer,
}: {
  openPlayerId: string | null;
  onOpenPlayer: (id: string) => void;
  onClosePlayer: () => void;
}) => {
  const squad = useFeed(FEEDS.squad);
  const club = useFeed(FEEDS.club);
  const [view, setView] = useState<'squad' | 'club'>('squad');

  const open = openPlayerId ? squad.data.players.find((p) => p.id === openPlayerId) ?? null : null;
  if (open) return <PlayerDetail player={open} onBack={onClosePlayer} />;

  const groups = [...new Set(squad.data.players.map((p) => p.group))];
  const unavailable = squad.data.players.filter((p) => p.availability !== 'fit');

  return (
    <div className="screen squad-screen">
      <div className="screen-head">
        <h1 className="screen-title">{view === 'squad' ? 'Squad' : 'The Club'}</h1>
        <div className="screen-head-right">
          <span className="rule-toggle">
            {(['squad', 'club'] as const).map((v) => (
              <button key={v} className={`chip chip--small${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v === 'squad' ? 'Squad' : 'Club'}
              </button>
            ))}
          </span>
          <StaleBadge stale={squad.stale} asOf={squad.asOf} />
        </div>
      </div>

      {view === 'club' ? (
        <ClubView club={club.data} />
      ) : (
        <>
          {unavailable.length > 0 && (
            <>
              <Rule label="Treatment room" accent="#EF0107" />
              <ul className="treatment">
                {unavailable.map((p) => (
                  <li key={p.id} className="treatment-row">
                    <button onClick={() => onOpenPlayer(p.id)}>
                      <span className="treatment-name">{p.name}</span>
                      <span className={`avail ${AVAIL[p.availability].cls}`}>{AVAIL[p.availability].label}</span>
                      <span className="treatment-note">{p.availabilityNote}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {groups.map((g) => (
            <div key={g}>
              <Rule label={g} accent="var(--gold)" />
              <div className="player-grid">
                {squad.data.players
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <button key={p.id} className="player-card" onClick={() => onOpenPlayer(p.id)}>
                      <span className="player-card-ghost" aria-hidden="true">
                        {p.num}
                      </span>
                      <span className="player-card-num">{p.num}</span>
                      <span className="player-card-name">{p.name}</span>
                      <span className="player-card-sub">
                        {p.pos} · {p.nat}
                      </span>
                      <span className="player-card-foot">
                        <span className="player-card-form">
                          {p.form.slice(0, 5).map((r, i) => (
                            <i key={i} className={`form-dot ${RES_CLASS[r]}`} />
                          ))}
                        </span>
                        {p.availability !== 'fit' && (
                          <span className={`avail avail--mini ${AVAIL[p.availability].cls}`}>
                            {AVAIL[p.availability].label}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {squad.data.players.length === 0 && <EmptyNote>Squad list arriving soon.</EmptyNote>}
        </>
      )}
    </div>
  );
};
