import { useMemo, useState } from 'react';
import {
  applyTransfer,
  autoPickSquad,
  buildRoundRecap,
  buildTournamentFantasyPlayerPool,
  isFantasyLocked,
  suggestTransfer,
  validateFantasySquad,
  type FantasyChip,
  type FantasyPlayer,
  type FantasySquad,
  type FantasyTransfer,
  type PlayerAppearance,
} from './fpl-rules.ts';
import { OPENING_FIXTURE, TEAMS, teamByCode } from '../data/tournament.ts';
import type { FantasyTeamSaved } from '../shared/types.ts';

const CHIPS: Array<{ id: FantasyChip; label: string; detail: string }> = [
  { id: 'wildcard', label: 'Wildcard', detail: 'Unlimited permanent transfers' },
  { id: 'free-hit', label: 'Free Hit', detail: 'One round only' },
  { id: 'bench-boost', label: 'Bench Boost', detail: 'Bench scores too' },
  { id: 'triple-captain', label: 'Triple Captain', detail: 'Captain scores x3' },
];

export function FantasyLeaguePanel(props: {
  peerId: string;
  roomId: string;
  archive: { documentId: string | null; pendingCount: number; lastSyncedAt: number | null };
  teams: readonly FantasyTeamSaved[];
  onSaveTeam: (team: FantasyTeamSaved) => Promise<void>;
  onPlayChip: (teamId: string, chip: FantasyChip, phase: 'group' | 'knockout') => Promise<void>;
}) {
  const pool = useMemo(() => buildTournamentFantasyPlayerPool(), []);
  const mine = props.teams.find((team) => team.managerId === props.peerId) ?? null;
  const [managerName, setManagerName] = useState(() => mine?.managerName ?? 'My team');
  const [preferredTeam, setPreferredTeam] = useState('ENG');
  const [preview, setPreview] = useState<FantasySquad>(() => mine?.squad ?? autoPickSquad(pool, props.peerId, ['ENG']));
  const [pendingTransfer, setPendingTransfer] = useState<FantasyTransfer | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const validation = validateFantasySquad(preview, pool);
  const leaderboard = [...props.teams].sort((a, b) => b.points - a.points || a.managerName.localeCompare(b.managerName));
  const deadlineLocked = isFantasyLocked(Date.now(), OPENING_FIXTURE.kickoff);
  const recap = mine ? buildRoundRecap(mine, pool, sampleAppearances(mine.squad, pool)) : null;

  const saveTeam = async () => {
    const now = Date.now();
    await props.onSaveTeam({
      id: mine?.id ?? `fantasy_${props.roomId}_${props.peerId}`,
      managerId: props.peerId,
      managerName: managerName.trim() || 'My team',
      squad: preview,
      freeTransfers: mine?.freeTransfers ?? 1,
      chipsUsed: mine?.chipsUsed ?? { group: [], knockout: [] },
      points: mine?.points ?? 0,
      updatedAt: now,
    });
    setPendingTransfer(null);
  };

  const refreshAutopick = () => {
    setPreview(autoPickSquad(pool, `${props.peerId}:${Date.now()}`, [preferredTeam]));
    setPendingTransfer(null);
    setTransferMessage(null);
  };

  const planTransfer = () => {
    const suggestion = suggestTransfer(preview, pool, `${props.peerId}:${Date.now()}`, [preferredTeam], mine?.freeTransfers ?? 1);
    setPendingTransfer(suggestion);
    setTransferMessage(suggestion ? null : 'No clear upgrade inside budget right now.');
  };

  const applyPlannedTransfer = () => {
    if (!pendingTransfer) return;
    setPreview(applyTransfer(preview, pool, pendingTransfer));
    setTransferMessage('Transfer applied. Save team to lock it in.');
  };

  return (
    <section className="fantasy-shell" aria-label="Tournament fantasy">
      <div className="fantasy-hero">
        <div>
          <p className="eyebrow">Tournament Fantasy</p>
          <h2>Premier League rules, tournament tempo</h2>
          <p>
            15-player squads, £100.0m budget, captaincy, bench order, free transfers,
            deadlines, and two chip sets. No account needed; your league can move with you.
          </p>
        </div>
        <div className="sealed-mini">
          <span>Your Data</span>
          <strong>{props.archive.documentId ? 'Sealed copy on' : 'Saved here'}</strong>
          <small>{formatArchiveStatus(props.archive)}</small>
        </div>
      </div>

      <div className="fantasy-layout">
        <section className="fantasy-manager">
          <div className="panel-head">
            <h3>Your squad</h3>
            <span>{deadlineLocked ? 'Locked' : formatMoney(spent(preview, pool)) + ' / £100.0m'}</span>
          </div>
          <div className="fantasy-controls">
            <label>
              Team name
              <input value={managerName} onChange={(event) => setManagerName(event.currentTarget.value)} />
            </label>
            <label>
              Bias autopick toward
              <select value={preferredTeam} onChange={(event) => setPreferredTeam(event.currentTarget.value)}>
                {TEAMS.map((team) => <option key={team.code} value={team.code}>{team.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={deadlineLocked} onClick={refreshAutopick}>Autopick</button>
            <button type="button" className="primary-action" disabled={!validation.valid || deadlineLocked} onClick={() => void saveTeam()}>
              Save team
            </button>
          </div>
          <div className="transfer-planner">
            <div>
              <strong>{`Free transfers: ${mine?.freeTransfers ?? 1}`}</strong>
              <span>Deadline {formatDeadline(OPENING_FIXTURE.kickoff)}</span>
            </div>
            <button type="button" disabled={deadlineLocked} onClick={planTransfer}>Suggest transfer</button>
            <button type="button" disabled={!pendingTransfer || deadlineLocked} onClick={applyPlannedTransfer}>Apply</button>
          </div>
          {pendingTransfer ? <TransferCard transfer={pendingTransfer} pool={pool} /> : null}
          {transferMessage ? <p className="transfer-message">{transferMessage}</p> : null}
          {!validation.valid ? (
            <ul className="fantasy-errors">
              {validation.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
          <SquadSheet squad={preview} pool={pool} />
        </section>

        <aside className="fantasy-side">
          <section>
            <div className="panel-head">
              <h3>Chips</h3>
              <span>group + knockout</span>
            </div>
            <div className="chip-grid">
              {CHIPS.map((chip) => {
                const used = mine?.chipsUsed.group.includes(chip.id) || mine?.chipsUsed.knockout.includes(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    disabled={!mine || used}
                    onClick={() => mine && void props.onPlayChip(mine.id, chip.id, 'group')}
                  >
                    <strong>{chip.label}</strong>
                    <span>{used ? 'Used' : chip.detail}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="panel-head">
              <h3>Room table</h3>
              <span>{leaderboard.length} teams</span>
            </div>
            <ol className="fantasy-table">
              {leaderboard.map((team) => (
                <li key={team.id}>
                  <strong>{team.managerName}</strong>
                  <span>{team.points} pts</span>
                </li>
              ))}
              {leaderboard.length === 0 ? <li className="muted">No squads saved yet.</li> : null}
            </ol>
          </section>

          <section>
            <div className="panel-head">
              <h3>Round recap</h3>
              <span>{recap ? `${recap.total} pts` : 'pending'}</span>
            </div>
            {recap?.topPlayer ? (
              <div className="fantasy-recap">
                <strong>{pool.find((player) => player.id === recap.topPlayer?.playerId)?.name ?? 'Top player'}</strong>
                <span>Top performer · {recap.topPlayer.points} pts</span>
                <small>Captain {recap.captainPoints} · Bench {recap.benchPoints}</small>
              </div>
            ) : (
              <p className="muted">Save a squad to see round scoring.</p>
            )}
          </section>

          <section>
            <div className="panel-head">
              <h3>Model upgrades</h3>
              <span>Shippie</span>
            </div>
            <ul className="fantasy-notes">
              <li>Group-stage and knockout chip sets match tournament rhythm.</li>
              <li>Room autopick gets a legal squad instantly for casual players.</li>
              <li>Manual scoring can be confirmed by the room when live stats lag.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

function SquadSheet(props: { squad: FantasySquad; pool: readonly FantasyPlayer[] }) {
  const players = props.squad.playerIds.map((id) => props.pool.find((item) => item.id === id)).filter((item): item is FantasyPlayer => Boolean(item));
  const groups = ['GKP', 'DEF', 'MID', 'FWD'] as const;
  return (
    <div className="squad-sheet">
      {groups.map((position) => (
        <div key={position} className="squad-line">
          <span>{position}</span>
          <div>
            {players.filter((player) => player.position === position).map((player) => (
              <PlayerPill key={player.id} player={player} captain={props.squad.captainId === player.id} bench={props.squad.benchIds.includes(player.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TransferCard(props: { transfer: FantasyTransfer; pool: readonly FantasyPlayer[] }) {
  const byId = new Map(props.pool.map((item) => [item.id, item]));
  const outgoing = byId.get(props.transfer.outPlayerId);
  const incoming = byId.get(props.transfer.inPlayerId);
  if (!outgoing || !incoming) return null;
  return (
    <div className="transfer-card">
      <span>Suggested move</span>
      <strong>{outgoing.name} → {incoming.name}</strong>
      <small>{props.transfer.pointsHit ? `-${props.transfer.pointsHit} pts hit` : 'Uses a free transfer'} · {formatMoney(outgoing.price)} to {formatMoney(incoming.price)}</small>
    </div>
  );
}

function PlayerPill(props: { player: FantasyPlayer; captain: boolean; bench: boolean }) {
  const team = teamByCode(props.player.teamCode);
  return (
    <span className={props.bench ? 'player-pill bench' : 'player-pill'}>
      <i style={{ background: `linear-gradient(90deg, ${team.swatch[0]}, ${team.swatch[1]})` }} />
      <strong>{props.player.name}{props.captain ? ' (C)' : ''}</strong>
      <em>{formatMoney(props.player.price)}</em>
    </span>
  );
}

function spent(squad: FantasySquad, pool: readonly FantasyPlayer[]): number {
  const byId = new Map(pool.map((item) => [item.id, item]));
  return squad.playerIds.reduce((sum, id) => sum + (byId.get(id)?.price ?? 0), 0);
}

function formatMoney(value: number): string {
  return `£${(value / 10).toFixed(1)}m`;
}

function formatArchiveStatus(archive: { pendingCount: number; lastSyncedAt: number | null }): string {
  if (archive.pendingCount > 0) return `${archive.pendingCount} saving`;
  if (!archive.lastSyncedAt) return 'Ready to recover';
  const elapsedMs = Date.now() - archive.lastSyncedAt;
  if (elapsedMs < 60_000) return 'Saved just now';
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Saved ${hours}h ago`;
}

function formatDeadline(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function sampleAppearances(squad: FantasySquad, pool: readonly FantasyPlayer[]): PlayerAppearance[] {
  return squad.playerIds.map((playerId, index) => {
    const player = pool.find((item) => item.id === playerId);
    return {
      playerId,
      minutes: index % 5 === 0 ? 58 : 90,
      goals: playerId === squad.captainId ? 1 : player?.position === 'MID' && index % 4 === 0 ? 1 : 0,
      assists: index % 3 === 0 ? 1 : 0,
      cleanSheet: player?.position === 'GKP' || player?.position === 'DEF',
      defensiveContributions: player?.position === 'DEF' ? 10 : 6,
      bonus: playerId === squad.captainId ? 3 : 0,
    };
  });
}
