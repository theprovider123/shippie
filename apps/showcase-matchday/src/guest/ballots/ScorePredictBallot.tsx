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
  return (
    <section className="ballot">
      <div className="ballot-head">
        <h2>{props.poll.question}</h2>
        <span>{props.tally?.totalVotes ?? 0} picks</span>
      </div>
      <div className="score-picker">
        <label>
          {props.poll.homeLabel}
          <input type="number" min={0} max={12} value={home} onChange={(event) => setHome(Number(event.currentTarget.value))} />
        </label>
        <label>
          {props.poll.awayLabel}
          <input type="number" min={0} max={12} value={away} onChange={(event) => setAway(Number(event.currentTarget.value))} />
        </label>
        <button disabled={props.disabled} onClick={() => props.onVote(home, away)}>Send</button>
      </div>
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
