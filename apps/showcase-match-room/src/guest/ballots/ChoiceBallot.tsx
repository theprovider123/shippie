import type { PollDescriptor, PollTally } from '@shippie/proximity';

export function ChoiceBallot(props: {
  poll: PollDescriptor;
  tally: PollTally | undefined;
  disabled: boolean;
  onVote: (value: number) => void;
}) {
  const total = props.tally?.totalVotes ?? 0;
  return (
    <section className="ballot">
      <div className="ballot-head">
        <h2>{props.poll.question}</h2>
        <span>{total} votes</span>
      </div>
      <div className="choice-grid">
        {props.poll.options.map((option, index) => {
          const count = props.tally?.perBucket[index] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <button key={option} disabled={props.disabled} onClick={() => props.onVote(index)}>
              <span>{option}</span>
              <strong>{pct}%</strong>
            </button>
          );
        })}
      </div>
      {props.disabled ? <p className="ballot-note">Joining the room. Voting unlocks as soon as the secure room connects.</p> : null}
    </section>
  );
}
