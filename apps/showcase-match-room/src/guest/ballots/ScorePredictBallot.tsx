import { useState } from 'react';
import type { ScorePoll, ScoreTally } from '../../shared/types.ts';

export function ScorePredictBallot(props: {
  poll: ScorePoll;
  tally: ScoreTally | undefined;
  disabled: boolean;
  onVote: (home: number, away: number) => void;
}) {
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  const [locked, setLocked] = useState(false);
  const lockTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(props.poll.closesAt));

  const submit = () => {
    props.onVote(home, away);
    setLocked(true);
    if (typeof window !== 'undefined' && 'vibrate' in window.navigator) {
      try {
        window.navigator.vibrate(18);
      } catch {
        // haptics unavailable; silent
      }
    }
  };

  return (
    <section className="ballot">
      <div className="ballot-head">
        <h2>{props.poll.question}</h2>
        <span>
          {props.tally?.totalVotes ?? 0} picks · {locked ? 'locked' : `locks ${lockTime}`}
        </span>
      </div>
      <div className={`score-picker${locked ? ' locked' : ''}`}>
        <label>
          {props.poll.homeLabel}
          <input
            type="number"
            min={0}
            max={12}
            value={home}
            disabled={locked}
            onChange={(event) => setHome(Number(event.currentTarget.value))}
          />
        </label>
        <span className="dash">—</span>
        <label>
          {props.poll.awayLabel}
          <input
            type="number"
            min={0}
            max={12}
            value={away}
            disabled={locked}
            onChange={(event) => setAway(Number(event.currentTarget.value))}
          />
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={props.disabled || locked}
          onClick={submit}
        >
          {locked ? 'Locked' : 'Lock score'}
        </button>
      </div>
      {props.disabled && !locked ? <p className="ballot-note">Joining the room. Your pick unlocks as soon as the secure room connects.</p> : null}
      {props.tally?.leaders.length ? (
        <ol className="score-leaders">
          {props.tally.leaders.map((item) => (
            <li key={item.score}>
              <span>{item.score}</span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
