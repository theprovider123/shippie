import { useState } from 'react';
import type { Challenge, CrewGroup, Player } from '../types';
import type { Copy } from '../data/translations';
import type { buildGameHighlights } from '../utils/state';
import { timeRank } from '../utils/ids';
import { GroupMark, PlayerAvatar } from './Atoms';
import { Icon } from './Icon';

export function Leaderboard(props: { title: string; players: Player[]; groups: CrewGroup[]; mode: 'people' | 'teams' }) {
  const groupScores = props.groups
    .map((group) => ({
      ...group,
      score: props.players
        .filter((player) => (player.groupId ?? 'all') === group.id)
        .reduce((sum, player) => sum + player.score, 0),
    }))
    .filter((group) => group.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = props.mode === 'people' ? (props.players[0]?.score ?? 0) : (groupScores[0]?.score ?? 0);

  return (
    <section className="game-leaderboard">
      <div className="leaderboard-head">
        <h3>{props.title}</h3>
        <strong>{top}</strong>
      </div>
      {props.mode === 'people' ? (
        <div className="podium">
          {[1, 0, 2].map((podiumIndex) => {
            const player = props.players[podiumIndex];
            if (!player) return <div key={podiumIndex} />;
            const place = podiumIndex + 1;
            return (
              <article key={player.id} className={`podium-place place-${place}`}>
                <span>{place}</span>
                <PlayerAvatar player={player} size={place === 1 ? 'large' : undefined} />
                <strong>{player.name}</strong>
                <small>{player.score} pts</small>
              </article>
            );
          })}
        </div>
      ) : null}
      <div className="group-score-list">
        {(props.mode === 'teams' ? groupScores : groupScores.slice(0, 3)).map((group, index) => (
          <div key={group.id} className="group-score">
            <GroupMark group={group} />
            <strong>{props.mode === 'teams' ? `${index + 1}. ${group.name}` : group.name}</strong>
            <small>{group.score} pts</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GameHighlights(props: { highlights: ReturnType<typeof buildGameHighlights>; onSelect: (challengeId: string) => void }) {
  if (!props.highlights.length) return null;
  return (
    <section className="game-highlight-row">
      {props.highlights.slice(0, 3).map((highlight) => (
        <button key={highlight.challengeId} type="button" onClick={() => props.onSelect(highlight.challengeId)}>
          <span>{highlight.label}</span>
          <strong>{highlight.title}</strong>
          <small>{highlight.detail}</small>
        </button>
      ))}
    </section>
  );
}

export function ChallengeGrid(props: {
  copy: Copy;
  challenges: Challenge[];
  groups: CrewGroup[];
  activePlayerId: string;
  showPoints: boolean;
  onSelect: (challengeId: string) => void;
  onScore: (challengeId: string) => void;
  onUploadProof: (event: React.ChangeEvent<HTMLInputElement>, challengeId: string) => void;
}) {
  const [scoredFlash, setScoredFlash] = useState<string | null>(null);
  if (!props.challenges.length) {
    return <p className="empty-note">No challenges today — host can add one from the + menu.</p>;
  }
  return (
    <div className="challenge-grid">
      {props.challenges.map((challenge) => {
        const done = challenge.doneBy.includes(props.activePlayerId);
        const groupName = challenge.groupId ? props.groups.find((group) => group.id === challenge.groupId)?.name : null;
        const submissions = challenge.submissions ?? [];
        return (
          <article
            key={challenge.id}
            className={`challenge${done ? ' done' : ''}${scoredFlash === challenge.id ? ' flashing' : ''}`}
            onClick={() => props.onSelect(challenge.id)}
          >
            <div className="challenge-meta">
              <span>{challenge.kind ?? 'challenge'}</span>
              {props.showPoints ? <b>{challenge.points} pts</b> : null}
            </div>
            <strong>{challenge.title}</strong>
            <span>{challenge.deadline ?? 'TBC'} / {challenge.doneBy.length} done{submissions.length ? ` / ${submissions.length} proof` : ''}{groupName ? ` / ${groupName}` : ''}</span>
            <div className="challenge-actions">
              <button
                disabled={done || challenge.status === 'closed'}
                onClick={(event) => {
                  event.stopPropagation();
                  setScoredFlash(challenge.id);
                  window.setTimeout(() => setScoredFlash((current) => (current === challenge.id ? null : current)), 480);
                  props.onScore(challenge.id);
                }}
              >
                {done ? <><Icon name="check" size={14} /> {props.copy.scored}</> : props.copy.scoreIt}
              </button>
              <label
                className={challenge.status === 'closed' ? 'file-button disabled' : 'file-button'}
                onClick={(event) => event.stopPropagation()}
              >
                {props.copy.addProof}
                <input
                  type="file"
                  name={`challenge-proof-${challenge.id}`}
                  accept="image/*,video/*"
                  disabled={challenge.status === 'closed'}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    props.onUploadProof(event, challenge.id);
                  }}
                />
              </label>
              <button
                className="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSelect(challenge.id);
                }}
              >
                {props.copy.details}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function GameSubmissions(props: {
  challenge: Challenge;
  groups: CrewGroup[];
  activePlayerId: string;
  copy: Copy;
  onCheer: (submissionId: string) => void;
}) {
  const submissions = [...(props.challenge.submissions ?? [])].sort((a, b) => b.cheers.length - a.cheers.length || timeRank(a.at) - timeRank(b.at));
  const [cheerFlash, setCheerFlash] = useState<string | null>(null);
  if (!submissions.length) {
    return <p className="empty-note">{props.copy.noEntries}</p>;
  }
  return (
    <div className="submission-grid">
      {submissions.map((submission) => {
        const groupName = submission.groupId ? props.groups.find((group) => group.id === submission.groupId)?.name : null;
        const cheered = submission.cheers.includes(props.activePlayerId);
        return (
          <article key={submission.id} className={submission.mediaDataUrl ? 'submission-card' : 'submission-card no-media'}>
            {submission.mediaKind === 'image' && submission.mediaDataUrl ? <img src={submission.mediaDataUrl} alt={submission.text} /> : null}
            {submission.mediaKind === 'video' && submission.mediaDataUrl ? <video src={submission.mediaDataUrl} controls /> : null}
            <div>
              <header>
                <span>{submission.at}</span>
                <strong>{submission.playerName}</strong>
              </header>
              <p>{submission.text}</p>
              <footer>
                <small>{groupName ?? props.copy.wholeCrew}</small>
                <button
                  className={`cheer-button${cheered ? ' active' : ''}${cheerFlash === submission.id ? ' bumped' : ''}`}
                  onClick={() => {
                    setCheerFlash(submission.id);
                    window.setTimeout(() => setCheerFlash((current) => (current === submission.id ? null : current)), 320);
                    props.onCheer(submission.id);
                  }}
                >
                  {props.copy.cheer} {submission.cheers.length}
                </button>
              </footer>
            </div>
          </article>
        );
      })}
    </div>
  );
}
