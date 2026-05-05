import { useEffect, useMemo, useState } from 'react';
import { qrSvg } from '@shippie/qr';
import type { PollDescriptor, PollTally } from '@shippie/proximity';
import { matchdayUrl } from '../shared/signal-config.ts';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';
import type { ScorePoll, ScoreTally } from '../shared/types.ts';
import { DEFAULT_PLAYERS, durationFromMinutes } from './host-controller.ts';

export function HostMatchday(props: {
  roomId: string;
  roomKey: string;
  signalBase: string;
  peerId: string;
}) {
  const room = useMatchdayRoom(props);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [question, setQuestion] = useState('Player of the match?');
  const [options, setOptions] = useState(DEFAULT_PLAYERS.join(', '));
  const guestUrl = useMemo(
    () => matchdayUrl({ role: 'play', roomId: props.roomId, roomKey: props.roomKey, signalBase: props.signalBase }),
    [props.roomId, props.roomKey, props.signalBase],
  );
  const displayUrl = useMemo(
    () => matchdayUrl({ role: 'display', roomId: props.roomId, roomKey: props.roomKey, signalBase: props.signalBase }),
    [props.roomId, props.roomKey, props.signalBase],
  );

  useEffect(() => {
    let cancelled = false;
    void qrSvg(guestUrl, { size: 220, ecc: 'M', brand: 'none', fg: '#12382E', bg: '#F7F3EA' })
      .then((svg) => {
        if (!cancelled) setQrMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setQrMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [guestUrl]);

  const openMotm = async () => {
    const parsed = options.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8);
    if (parsed.length < 2) return;
    await room.openChoicePoll(question, parsed, durationFromMinutes(8));
  };

  return (
    <main className="matchday host-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Host board</p>
          <h1>Matchday control</h1>
        </div>
        <StatusPill status={room.status.connection} peers={room.status.peerCount} />
      </header>

      <section className="host-grid">
        <div className="control-column">
          <section className="operator-panel">
            <div className="panel-head">
              <h2>Open a poll</h2>
              <span>{props.roomId}</span>
            </div>
            <label>
              Question
              <input value={question} onChange={(event) => setQuestion(event.currentTarget.value)} />
            </label>
            <label>
              Choices
              <input value={options} onChange={(event) => setOptions(event.currentTarget.value)} />
            </label>
            <div className="command-row">
              <button className="primary-action" onClick={openMotm}>MOTM</button>
              <button onClick={() => void room.openRatingPoll('How loud is the ground?', durationFromMinutes(5))}>Rating</button>
              <button onClick={() => void room.openScorePoll({
                question: 'Predict the final score',
                homeLabel: 'Home',
                awayLabel: 'Away',
                durationSeconds: durationFromMinutes(8),
              })}>Score</button>
            </div>
          </section>

          <section className="operator-panel">
            <div className="panel-head">
              <h2>Guest QR</h2>
              <button onClick={() => void navigator.clipboard?.writeText(guestUrl)}>Copy</button>
            </div>
            {qrMarkup ? <div className="qr-frame" dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : <code>{guestUrl}</code>}
          </section>

          <section className="operator-panel">
            <div className="panel-head">
              <h2>Screen feed</h2>
              <button onClick={() => void navigator.clipboard?.writeText(displayUrl)}>Copy</button>
            </div>
            <code>{displayUrl}</code>
          </section>
        </div>

        <div className="results-column">
          <section className="operator-panel live-results">
            <div className="panel-head">
              <h2>Live tallies</h2>
              <span>{room.polls.length + room.scorePolls.length} polls</span>
            </div>
            {room.polls.map((poll) => (
              <CrowdResult
                key={poll.id}
                poll={poll}
                tally={room.tallies.find((item) => item.pollId === poll.id)}
                onClose={() => void room.closeCrowdPoll(poll.id)}
              />
            ))}
            {room.scorePolls.map((poll) => (
              <ScoreResult
                key={poll.id}
                poll={poll}
                tally={room.scoreTallies.find((item) => item.pollId === poll.id)}
                onClose={() => void room.closeScorePoll(poll.id)}
              />
            ))}
            {room.polls.length === 0 && room.scorePolls.length === 0 ? <p className="muted">No poll open yet.</p> : null}
          </section>

          <section className="operator-panel">
            <div className="panel-head">
              <h2>Shout-outs</h2>
              <span>{room.pendingShoutouts.length} pending</span>
            </div>
            <div className="moderation-list">
              {room.pendingShoutouts.map((item) => (
                <div key={item.id} className="moderation-item">
                  <p>{item.text}</p>
                  <button onClick={() => void room.approveShoutout(item.id)}>Approve</button>
                </div>
              ))}
              {room.pendingShoutouts.length === 0 ? <p className="muted">Queue clear.</p> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function CrowdResult(props: { poll: PollDescriptor; tally: PollTally | undefined; onClose: () => void }) {
  const total = props.tally?.totalVotes ?? 0;
  const closed = Date.now() > props.poll.closesAt;
  return (
    <article className="result-block">
      <div className="result-title">
        <h3>{props.poll.question}</h3>
        <button disabled={closed} onClick={props.onClose}>{closed ? 'Closed' : 'Close'}</button>
      </div>
      {props.poll.kind === 'choice' ? props.poll.options.map((option, index) => {
        const count = props.tally?.perBucket[index] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return <Bar key={option} label={option} value={pct} count={count} />;
      }) : [1, 2, 3, 4, 5].map((score, index) => {
        const count = props.tally?.perBucket[index] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return <Bar key={score} label={`${score}`} value={pct} count={count} />;
      })}
    </article>
  );
}

function ScoreResult(props: { poll: ScorePoll; tally: ScoreTally | undefined; onClose: () => void }) {
  const closed = Date.now() > props.poll.closesAt;
  return (
    <article className="result-block">
      <div className="result-title">
        <h3>{props.poll.question}</h3>
        <button disabled={closed} onClick={props.onClose}>{closed ? 'Closed' : 'Close'}</button>
      </div>
      {(props.tally?.leaders ?? []).map((item) => (
        <Bar key={item.score} label={item.score} value={props.tally?.totalVotes ? Math.round((item.count / props.tally.totalVotes) * 100) : 0} count={item.count} />
      ))}
      {!props.tally?.leaders.length ? <p className="muted">Waiting for predictions.</p> : null}
    </article>
  );
}

function Bar(props: { label: string; value: number; count: number }) {
  return (
    <div className="bar-row">
      <div>
        <span>{props.label}</span>
        <strong>{props.count}</strong>
      </div>
      <i style={{ transform: `scaleX(${Math.max(0.02, props.value / 100)})` }} />
    </div>
  );
}

function StatusPill(props: { status: string; peers: number }) {
  return (
    <div className={`status-pill ${props.status}`}>
      <span />
      {props.status === 'open' ? `${props.peers} peers` : props.status}
    </div>
  );
}
