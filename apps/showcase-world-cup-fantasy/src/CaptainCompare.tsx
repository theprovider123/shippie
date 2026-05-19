/**
 * Captain compare — tap two players, see side-by-side "if captain"
 * scoring per spec §7.3. Pure UI; the scoring math comes from
 * `fantasy-engine.ts` (triple-captain multiplier honoured).
 */
import { useMemo } from 'react';
import {
  LIVE_SNAPSHOTS,
  PLAYER_BY_ID,
  scorePlayer,
  type Chip,
  type Player,
} from './fantasy-engine.ts';

export interface CaptainCompareProps {
  candidateIds: readonly string[];          // up to 2; extras ignored
  chip: Chip;
  snapshotIndex: number;
  onClear: () => void;
  onPickCaptain?: (playerId: string) => void;
}

interface ComparisonLine {
  player: Player;
  base: number;
  captainPoints: number;
  tripleCaptainPoints: number;
  reasons: string[];
}

function buildLine(player: Player, snapshotIndex: number): ComparisonLine {
  const snapshot = LIVE_SNAPSHOTS[Math.min(LIVE_SNAPSHOTS.length - 1, Math.max(0, snapshotIndex))]!;
  const line = scorePlayer(player, snapshot);
  return {
    player,
    base: line.points,
    captainPoints: line.points * 2,
    tripleCaptainPoints: line.points * 3,
    reasons: line.reasons.slice(0, 3),
  };
}

export function CaptainCompare(props: CaptainCompareProps) {
  const pair = useMemo(() => {
    return props.candidateIds
      .map((id) => PLAYER_BY_ID.get(id))
      .filter((player): player is Player => Boolean(player))
      .slice(0, 2)
      .map((player) => buildLine(player, props.snapshotIndex));
  }, [props.candidateIds, props.snapshotIndex]);

  if (pair.length < 2) {
    return (
      <section className="captain-compare captain-compare--prompt" aria-label="Captain compare">
        <header>
          <p className="eyebrow">Captain compare</p>
          <h2>Tap two players to see who captains better.</h2>
        </header>
        <p className="muted">
          Long-press a player in the market to pick the second slot. The "if captain" line
          accounts for triple-captain when active.
        </p>
      </section>
    );
  }

  const tripleActive = props.chip === 'triple-captain';
  const winner = pair.slice().sort((a, b) => (tripleActive ? b.tripleCaptainPoints - a.tripleCaptainPoints : b.captainPoints - a.captainPoints))[0]!;

  return (
    <section className="captain-compare" aria-label="Captain compare">
      <header>
        <div>
          <p className="eyebrow">Captain compare</p>
          <h2>If captain</h2>
        </div>
        <button type="button" onClick={props.onClear}>Clear</button>
      </header>
      <div className="captain-compare__grid">
        {pair.map((line) => {
          const isWinner = line.player.id === winner.player.id;
          return (
            <article
              key={line.player.id}
              className={`captain-compare__card${isWinner ? ' captain-compare__card--winner' : ''}`}
            >
              <header>
                <strong>{line.player.name}</strong>
                <span>{line.player.team} · {line.player.position}</span>
              </header>
              <dl>
                <div>
                  <dt>Base</dt>
                  <dd>{line.base}</dd>
                </div>
                <div>
                  <dt>Captain</dt>
                  <dd>{line.captainPoints}</dd>
                </div>
                <div>
                  <dt>Triple captain</dt>
                  <dd>{line.tripleCaptainPoints}</dd>
                </div>
              </dl>
              <ul>
                {line.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              {props.onPickCaptain ? (
                <button type="button" className={isWinner ? 'primary' : ''} onClick={() => props.onPickCaptain?.(line.player.id)}>
                  Make captain
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
