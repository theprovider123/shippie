import { useMemo } from 'react';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';

export function DisplayMatchday(props: {
  roomId: string;
  roomKey: string;
  signalBase: string;
  peerId: string;
}) {
  const room = useMatchdayRoom(props);
  const headlinePoll = useMemo(() => room.polls[0] ?? null, [room.polls]);
  const headlineTally = headlinePoll ? room.tallies.find((item) => item.pollId === headlinePoll.id) : null;
  const topChoice = headlinePoll && headlinePoll.kind === 'choice'
    ? headlinePoll.options
      .map((label, index) => ({ label, count: headlineTally?.perBucket[index] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0]
    : null;
  const scorePoll = room.scorePolls[0] ?? null;
  const scoreTally = scorePoll ? room.scoreTallies.find((item) => item.pollId === scorePoll.id) : null;
  const shoutout = room.approvedShoutouts[0] ?? null;

  return (
    <main className="display-shell">
      <header className="display-header">
        <div>
          <p className="eyebrow">Matchday live</p>
          <h1>{headlinePoll?.question ?? 'Waiting for the next vote'}</h1>
        </div>
        <div className={`status-pill ${room.status.connection}`}>
          <span />
          {room.status.connection === 'open' ? `${room.status.peerCount} linked` : room.status.connection}
        </div>
      </header>

      <section className="display-stage">
        <div className="display-main">
          <span>Leading now</span>
          <strong>{topChoice?.label ?? scoreTally?.leaders[0]?.score ?? 'Stand by'}</strong>
          <em>{topChoice ? `${topChoice.count} votes` : scoreTally ? `${scoreTally.totalVotes} predictions` : 'Host will open the next moment'}</em>
        </div>
        <div className="display-side">
          <h2>Score picks</h2>
          {(scoreTally?.leaders ?? []).slice(0, 3).map((item) => (
            <div key={item.score} className="display-row">
              <span>{item.score}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
          {!scoreTally?.leaders.length ? <p>Predictions will appear here.</p> : null}
        </div>
      </section>

      <section className="display-shoutout">
        <span>Fan shout-out</span>
        <strong>{shoutout?.text ?? 'Approved messages will appear here.'}</strong>
      </section>
    </main>
  );
}
