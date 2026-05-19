import type { PollDescriptor, PollTally } from '@shippie/proximity';

const RATING_LABELS = ['Flat', 'Calm', 'On edge', 'Loud', 'Chaos'];

export function RatingBallot(props: {
  poll: PollDescriptor;
  tally: PollTally | undefined;
  disabled: boolean;
  onVote: (value: number) => void;
}) {
  return (
    <section className="ballot">
      <div className="ballot-head">
        <h2>{props.poll.question}</h2>
        <span>{props.tally?.mean ? props.tally.mean.toFixed(1) : 'New'}</span>
      </div>
      <div className="rating-row" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} disabled={props.disabled} onClick={() => props.onVote(value)}>
            <strong>{value}</strong>
            <span>{RATING_LABELS[value - 1]}</span>
          </button>
        ))}
      </div>
      {props.disabled ? <p className="ballot-note">Joining the room. Rating unlocks as soon as the secure room connects.</p> : null}
    </section>
  );
}
