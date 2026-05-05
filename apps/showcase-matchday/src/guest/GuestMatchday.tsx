import { useMemo } from 'react';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';
import { ChoiceBallot } from './ballots/ChoiceBallot.tsx';
import { RatingBallot } from './ballots/RatingBallot.tsx';
import { ScorePredictBallot } from './ballots/ScorePredictBallot.tsx';
import { ShoutoutForm } from './ShoutoutForm.tsx';

export function GuestMatchday(props: {
  roomId: string;
  roomKey: string;
  signalBase: string;
  peerId: string;
}) {
  const room = useMatchdayRoom(props);
  const openPolls = room.polls.filter((poll) => Date.now() <= poll.closesAt);
  const openScorePolls = room.scorePolls.filter((poll) => Date.now() <= poll.closesAt);
  const latestApproved = useMemo(() => room.approvedShoutouts[0], [room.approvedShoutouts]);

  return (
    <main className="matchday guest-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Matchday</p>
          <h1>Live votes</h1>
        </div>
        <StatusPill status={room.status.connection} peers={room.status.peerCount} />
      </header>

      {latestApproved ? (
        <section className="screen-strip">
          <span>On screen</span>
          <strong>{latestApproved.text}</strong>
        </section>
      ) : null}

      <section className="ballot-stack">
        {openPolls.map((poll) => {
          const tally = room.tallies.find((item) => item.pollId === poll.id);
          if (poll.kind === 'choice') {
            return (
              <ChoiceBallot
                key={poll.id}
                poll={poll}
                tally={tally}
                disabled={room.status.connection !== 'open'}
                onVote={(value) => void room.voteCrowd(poll, value)}
              />
            );
          }
          return (
            <RatingBallot
              key={poll.id}
              poll={poll}
              tally={tally}
              disabled={room.status.connection !== 'open'}
              onVote={(value) => void room.voteCrowd(poll, value)}
            />
          );
        })}
        {openScorePolls.map((poll) => (
          <ScorePredictBallot
            key={poll.id}
            poll={poll}
            tally={room.scoreTallies.find((item) => item.pollId === poll.id)}
            disabled={room.status.connection !== 'open'}
            onVote={(home, away) => void room.voteScore(poll, home, away)}
          />
        ))}
        {openPolls.length === 0 && openScorePolls.length === 0 ? (
          <section className="empty-state">
            <p>Waiting for the next half-time moment.</p>
          </section>
        ) : null}
      </section>

      <ShoutoutForm disabled={room.status.connection !== 'open'} onSubmit={room.submitShoutout} />
    </main>
  );
}

function StatusPill(props: { status: string; peers: number }) {
  return (
    <div className={`status-pill ${props.status}`}>
      <span />
      {props.status === 'open' ? `${props.peers} nearby` : props.status}
    </div>
  );
}
