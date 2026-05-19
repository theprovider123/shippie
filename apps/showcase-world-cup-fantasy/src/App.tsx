import { useEffect, useMemo, useState } from 'react';
import { haptic } from '@shippie/sdk/wrapper';
import {
  BUDGET,
  CHIPS,
  LIMITS,
  LIVE_SNAPSHOTS,
  PLAYER_BY_ID,
  PLAYERS,
  POSITIONS,
  RIVAL_TEAMS,
  STORAGE_KEY,
  isChip,
  liveSnapshotAt,
  providerReadiness,
  scoreFantasyTeam,
  scorePlayer,
  scoutTips,
  type Chip,
  type Player,
  type Position,
  type SavedTeam,
} from './fantasy-engine.ts';

function loadTeam(): SavedTeam {
  if (typeof localStorage === 'undefined') return emptyTeam();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyTeam();
    const parsed = JSON.parse(raw) as Partial<SavedTeam>;
    return {
      manager: typeof parsed.manager === 'string' ? parsed.manager : '',
      squadIds: Array.isArray(parsed.squadIds) ? parsed.squadIds.filter((id): id is string => typeof id === 'string' && PLAYER_BY_ID.has(id)) : [],
      captainId: typeof parsed.captainId === 'string' && PLAYER_BY_ID.has(parsed.captainId) ? parsed.captainId : null,
      chip: isChip(parsed.chip) ? parsed.chip : 'none',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return emptyTeam();
  }
}

function emptyTeam(): SavedTeam {
  return { manager: '', squadIds: [], captainId: null, chip: 'none', updatedAt: null };
}

function saveTeam(team: SavedTeam): SavedTeam {
  const next = { ...team, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local-first best effort; the UI still works for the session.
  }
  return next;
}

export function App() {
  const [team, setTeam] = useState<SavedTeam>(() => loadTeam());
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const snapshot = liveSnapshotAt(snapshotIndex);
  const squad = useMemo(() => team.squadIds.map((id) => PLAYER_BY_ID.get(id)).filter((player): player is Player => Boolean(player)), [team.squadIds]);
  const spent = squad.reduce((total, player) => total + player.price, 0);
  const left = Math.round((BUDGET - spent) * 10) / 10;
  const teamScore = useMemo(() => scoreFantasyTeam(squad, team.captainId, team.chip, snapshot), [snapshot, squad, team.captainId, team.chip]);
  const projected = squad.reduce((total, player) => total + player.projected, 0) + captainProjectionBonus(squad, team.captainId, team.chip);
  const valid = validateSquad(squad);
  const captain = team.captainId ? PLAYER_BY_ID.get(team.captainId) ?? null : null;
  const captainLine = captain ? scorePlayer(captain, snapshot) : null;
  const leaderboard = useMemo(() => {
    const rivals = RIVAL_TEAMS.map((entry) => {
      const rivalSquad = entry.squadIds.map((id) => PLAYER_BY_ID.get(id)).filter((player): player is Player => Boolean(player));
      return {
        manager: entry.manager,
        chip: entry.chip,
        score: scoreFantasyTeam(rivalSquad, entry.captainId, entry.chip, snapshot),
      };
    });
    return [
      { manager: team.manager || 'You', chip: team.chip, score: teamScore },
      ...rivals,
    ].sort((a, b) => b.score.total - a.score.total || a.manager.localeCompare(b.manager));
  }, [snapshot, team.chip, team.manager, teamScore]);
  const tips = useMemo(() => scoutTips(squad, team.captainId, team.chip, snapshot), [snapshot, squad, team.captainId, team.chip]);
  const readiness = useMemo(() => providerReadiness(PLAYERS), []);

  useEffect(() => {
    if (team.captainId && !team.squadIds.includes(team.captainId)) {
      setTeam((current) => ({ ...current, captainId: current.squadIds[0] ?? null }));
    }
  }, [team.captainId, team.squadIds]);

  const togglePlayer = (player: Player) => {
    setTeam((current) => {
      const selected = current.squadIds.includes(player.id);
      if (selected) {
        const squadIds = current.squadIds.filter((id) => id !== player.id);
        return { ...current, squadIds, captainId: current.captainId === player.id ? squadIds[0] ?? null : current.captainId };
      }
      const nextSquad = [...current.squadIds, player.id].map((id) => PLAYER_BY_ID.get(id)).filter((item): item is Player => Boolean(item));
      if (!canAddPlayer(nextSquad, player.position)) {
        haptic('warn');
        return current;
      }
      haptic('tap');
      return { ...current, squadIds: nextSquad.map((item) => item.id), captainId: current.captainId ?? player.id };
    });
  };

  const autoPick = () => {
    const picked: Player[] = [];
    for (const position of POSITIONS) {
      const options = PLAYERS
        .filter((player) => player.position === position)
        .sort((a, b) => (b.projected / b.price) - (a.projected / a.price));
      for (const player of options) {
        if (picked.filter((item) => item.position === position).length >= LIMITS[position]) break;
        const candidate = [...picked, player];
        if (candidate.reduce((total, item) => total + item.price, 0) <= BUDGET && teamCount(candidate, player.team) <= 3) {
          picked.push(player);
        }
      }
    }
    const captainId = picked.sort((a, b) => b.projected - a.projected)[0]?.id ?? null;
    setTeam((current) => saveTeam({ ...current, squadIds: picked.map((player) => player.id), captainId }));
    haptic('success');
  };

  const save = () => {
    setTeam((current) => saveTeam(current));
    haptic(valid.ok ? 'success' : 'warn');
  };

  const clear = () => {
    setTeam(emptyTeam());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best effort only.
    }
    haptic('warn');
  };

  const pullLatest = () => {
    setSnapshotIndex((current) => (current + 1) % LIVE_SNAPSHOTS.length);
    haptic('tap');
  };

  return (
    <main className="fantasy-app">
      <header className="fantasy-topbar">
        <div>
          <p className="eyebrow">Private preview</p>
          <h1>World Cup Fantasy</h1>
          <p>Build a 15-player squad as its own quiet tool, separate from Match Room.</p>
        </div>
        <span>Local squad</span>
      </header>

      <section className="hero" aria-label="Squad builder">
        <p className="eyebrow">Live scoring model</p>
        <h2>Your squad should move with the match.</h2>
        <p>Provider stats become clean, auditable fantasy points. Goals, assists, saves, VAR corrections, chips, and room swings all recalculate from source.</p>
      </section>

      <section className="manager-strip" aria-label="Team controls">
        <label>
          Manager
          <input
            value={team.manager}
            placeholder="Your name"
            onChange={(event) => {
              const manager = event.currentTarget.value;
              setTeam((current) => ({ ...current, manager }));
            }}
          />
        </label>
        <button className="primary" onClick={autoPick}>Auto-pick squad</button>
        <button onClick={save}>Save team</button>
      </section>

      <section className="scoreboard" aria-label="Squad status">
        <Metric label="Budget left" value={`${left.toFixed(1)}m`} warn={left < 0} />
        <Metric label="Players" value={`${squad.length}/15`} warn={squad.length !== 15} />
        <Metric label="Live points" value={teamScore.total.toString()} />
        <Metric label="Captain live" value={captainLine ? `${captainLine.points} pts` : 'Pick one'} warn={!captain} />
      </section>

      <section className={valid.ok ? 'status ok' : 'status warn'}>
        <strong>{valid.ok ? 'Squad valid' : 'Needs fixing'}</strong>
        <span>{valid.message}{valid.ok ? ` Tournament projection: ${projected}.` : ''}</span>
      </section>

      <div className="live-grid">
        <section className="live-panel" aria-label="Live data bridge">
          <div className="section-head">
            <div>
              <p className="eyebrow">Data bridge</p>
              <h2>{snapshot.label}</h2>
            </div>
            <button className="primary" type="button" onClick={pullLatest}>Pull latest</button>
          </div>
          <p className="muted">{snapshot.providerMessage}</p>
          <div className="readiness-grid">
            {readiness.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <details className="rules-drawer">
            <summary>Scoring rules</summary>
            <ul>
              <li>Appearance: 1 point, or 2 after 60 minutes.</li>
              <li>Goals: GK 10, DEF 6, MID 5, FWD 4.</li>
              <li>Assists: 3. Clean sheets: GK/DEF 4, MID 1.</li>
              <li>Saves, key passes, recoveries, player of match, and cards are transparent bonuses/deductions.</li>
            </ul>
          </details>
        </section>

        <section className="live-panel" aria-label="Live match feed">
          <div className="section-head">
            <div>
              <p className="eyebrow">{snapshot.status === 'final' ? 'Final' : 'Live feed'}</p>
              <h2>Match swings</h2>
            </div>
            <span>{snapshot.updatedAt}</span>
          </div>
          <div className="event-list">
            {snapshot.events.length ? snapshot.events.map((event) => (
              <article key={`${event.minute}:${event.title}`} className={`event-row ${event.swing < 0 ? 'negative' : ''}`}>
                <span>{event.minute}</span>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
                <em>{event.swing > 0 ? '+' : ''}{event.swing}</em>
              </article>
            )) : <p className="empty">No live events yet. Pull the latest snapshot to see scoring move.</p>}
          </div>
        </section>
      </div>

      <div className="live-grid">
        <section className="live-panel" aria-label="Room leaderboard">
          <div className="section-head">
            <div>
              <p className="eyebrow">Room</p>
              <h2>Leaderboard swing</h2>
            </div>
            <span>{team.chip === 'none' ? 'Classic' : CHIPS.find((chip) => chip.id === team.chip)?.label}</span>
          </div>
          <div className="leaderboard">
            {leaderboard.map((entry, index) => (
              <article key={entry.manager} className={entry.manager === (team.manager || 'You') ? 'leader-row you' : 'leader-row'}>
                <span>#{index + 1}</span>
                <strong>{entry.manager}</strong>
                <em>{entry.score.total} pts</em>
              </article>
            ))}
          </div>
        </section>

        <section className="live-panel" aria-label="AI scout">
          <div className="section-head">
            <div>
              <p className="eyebrow">Scout</p>
              <h2>Next best move</h2>
            </div>
            <button type="button" onClick={autoPick}>Auto-fix</button>
          </div>
          <ul className="tip-list">
            {tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
          {teamScore.counting.length ? (
            <div className="points-breakdown">
              <h3>Top scoring picks</h3>
              {teamScore.counting.slice(0, 5).map((line) => (
                <article key={line.player.id}>
                  <span>{line.player.name}</span>
                  <strong>{line.points}</strong>
                  <p>{line.reasons.slice(0, 3).join(' · ')}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <section className="chips" aria-label="Chips">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            className={team.chip === chip.id ? 'selected' : ''}
            aria-pressed={team.chip === chip.id}
            onClick={() => setTeam((current) => ({ ...current, chip: chip.id }))}
          >
            <strong>{chip.label}</strong>
            <span>{chip.hint}</span>
          </button>
        ))}
      </section>

      <div className="builder">
        <section className="squad" aria-label="Selected squad">
          <div className="section-head">
            <div>
              <p className="eyebrow">Your team</p>
              <h2>Squad</h2>
            </div>
            <button onClick={clear}>Clear</button>
          </div>
          {POSITIONS.map((position) => (
            <PositionGroup
              key={position}
              position={position}
              players={squad.filter((player) => player.position === position)}
              captainId={team.captainId}
              onCaptain={(id) => setTeam((current) => ({ ...current, captainId: id }))}
              onRemove={(player) => togglePlayer(player)}
            />
          ))}
        </section>

        <section className="market" aria-label="Player market">
          <div className="section-head">
            <div>
              <p className="eyebrow">Market</p>
              <h2>Players</h2>
            </div>
            <span>{PLAYERS.length} listed</span>
          </div>
          {POSITIONS.map((position) => (
            <div key={position} className="market-group">
              <h3>{position}</h3>
              {PLAYERS.filter((player) => player.position === position).map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  selected={team.squadIds.includes(player.id)}
                  disabled={!team.squadIds.includes(player.id) && !canSelectFromState(team, player)}
                  onToggle={() => togglePlayer(player)}
                />
              ))}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function Metric(props: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={props.warn ? 'metric warn' : 'metric'}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PositionGroup(props: {
  position: Position;
  players: Player[];
  captainId: string | null;
  onCaptain: (id: string) => void;
  onRemove: (player: Player) => void;
}) {
  return (
    <section className="position-group">
      <header>
        <h3>{props.position}</h3>
        <span>{props.players.length}/{LIMITS[props.position]}</span>
      </header>
      {props.players.length === 0 ? <p className="empty">No picks yet.</p> : null}
      {props.players.map((player) => (
        <article key={player.id} className={props.captainId === player.id ? 'squad-player captain' : 'squad-player'}>
          <div>
            <strong>{player.name}</strong>
            <span>{player.team} · {player.price.toFixed(1)}m · {player.projected} pts</span>
          </div>
          <button onClick={() => props.onCaptain(player.id)}>{props.captainId === player.id ? 'Captain' : 'C'}</button>
          <button onClick={() => props.onRemove(player)}>Remove</button>
        </article>
      ))}
    </section>
  );
}

function PlayerRow(props: { player: Player; selected: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button className={props.selected ? 'player-row selected' : 'player-row'} disabled={props.disabled} onClick={props.onToggle}>
      <span>
        <strong>{props.player.name}</strong>
        <em>{props.player.team} · {props.player.note}</em>
      </span>
      <span>{props.player.price.toFixed(1)}m</span>
      <span>{props.player.projected}</span>
    </button>
  );
}

function validateSquad(squad: Player[]): { ok: boolean; message: string } {
  const spent = squad.reduce((total, player) => total + player.price, 0);
  if (spent > BUDGET) return { ok: false, message: `Over budget by ${(spent - BUDGET).toFixed(1)}m.` };
  if (squad.length !== 15) return { ok: false, message: `Pick ${15 - squad.length} more player${15 - squad.length === 1 ? '' : 's'}.` };
  for (const position of POSITIONS) {
    const count = squad.filter((player) => player.position === position).length;
    if (count !== LIMITS[position]) return { ok: false, message: `${position} needs ${LIMITS[position]} players.` };
  }
  const teamCounts = new Map<string, number>();
  for (const player of squad) {
    teamCounts.set(player.team, (teamCounts.get(player.team) ?? 0) + 1);
  }
  const crowded = Array.from(teamCounts.entries()).find(([, count]) => count > 3);
  if (crowded) return { ok: false, message: `Too many from ${crowded[0]} (max 3).` };
  return { ok: true, message: 'Ready to share into a private space when league rooms are switched on.' };
}

function canAddPlayer(squad: Player[], position: Position): boolean {
  if (squad.length > 15) return false;
  if (squad.filter((player) => player.position === position).length > LIMITS[position]) return false;
  if (squad.reduce((total, player) => total + player.price, 0) > BUDGET) return false;
  return !Array.from(new Set(squad.map((player) => player.team))).some((team) => teamCount(squad, team) > 3);
}

function canSelectFromState(team: SavedTeam, player: Player): boolean {
  const squad = [...team.squadIds, player.id].map((id) => PLAYER_BY_ID.get(id)).filter((item): item is Player => Boolean(item));
  return canAddPlayer(squad, player.position);
}

function teamCount(squad: Player[], team: string): number {
  return squad.filter((player) => player.team === team).length;
}

function captainProjectionBonus(squad: Player[], captainId: string | null, chip: Chip): number {
  const captain = captainId ? squad.find((player) => player.id === captainId) : null;
  if (!captain) return 0;
  return chip === 'triple-captain' ? captain.projected * 2 : captain.projected;
}
